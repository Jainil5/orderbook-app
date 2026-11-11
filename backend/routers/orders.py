from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend import db
from backend.services.analytics import STATUSES

router = APIRouter(prefix="/api/orders", tags=["orders"])
CHANNELS = ["counter", "online", "phone"]
PAYMENTS = ["cash", "card", "upi", "credit"]


class LineIn(BaseModel):
    product_id: int
    qty: int = Field(gt=0, le=999)


class OrderIn(BaseModel):
    items: list[LineIn] = Field(min_length=1)
    customer_id: int | None = None
    channel: str = "counter"
    discount_percent: float = Field(0, ge=0, le=100)
    payment_method: str = "cash"
    paid_amount: float | None = None
    note: str | None = None


class OrderPatch(BaseModel):
    status: str | None = None
    paid_amount: float | None = Field(None, ge=0)
    payment_method: str | None = None
    note: str | None = None


def _detail(oid: int) -> dict:
    order = db.one(
        """SELECT o.*, c.name customer_name FROM orders o
           LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?""",
        (oid,),
    )
    if not order:
        raise HTTPException(404, f"order {oid} not found")
    order["items"] = db.query(
        """SELECT id, product_id, name, qty, unit_price, cost_price, line_total
           FROM order_items WHERE order_id = ? ORDER BY id""",
        (oid,),
    )
    order["outstanding"] = round(max(order["total"] - order["paid_amount"], 0), 2)
    return order


@router.get("")
def list_orders(status: str | None = None, q: str | None = None,
                limit: int = Query(100, le=500)) -> list[dict]:
    sql = """SELECT o.*, c.name customer_name,
                    (SELECT SUM(oi.qty) FROM order_items oi WHERE oi.order_id = o.id) units
             FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE 1=1"""
    params: list = []
    if status:
        sql += " AND o.status = ?"
        params.append(status)
    if q:
        sql += " AND (o.order_no LIKE ? OR c.name LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY o.created_at DESC LIMIT ?"
    params.append(limit)
    rows = db.query(sql, tuple(params))
    for r in rows:
        r["outstanding"] = round(max(r["total"] - r["paid_amount"], 0), 2)
    return rows


@router.post("")
def create_order(body: OrderIn) -> dict:
    """Prices and totals are computed from the products table, never trusted from the client."""
    if body.channel not in CHANNELS:
        raise HTTPException(422, f"channel must be one of {CHANNELS}")
    if body.payment_method not in PAYMENTS:
        raise HTTPException(422, f"payment_method must be one of {PAYMENTS}")
    settings = db.one("SELECT * FROM settings WHERE id = 1")
    if body.customer_id and not db.one("SELECT id FROM customers WHERE id = ?", (body.customer_id,)):
        raise HTTPException(422, "unknown customer_id")

    priced: list[dict] = []
    for line in body.items:
        product = db.one("SELECT * FROM products WHERE id = ?", (line.product_id,))
        if not product:
            raise HTTPException(422, f"product {line.product_id} does not exist")
        if not product["active"]:
            raise HTTPException(422, f"{product['name']} is inactive")
        priced.append({
            "product_id": product["id"], "name": product["name"], "qty": line.qty,
            "unit_price": product["price"], "cost_price": product["cost_price"],
            "line_total": round(product["price"] * line.qty, 2),
        })

    subtotal = round(sum(p["line_total"] for p in priced), 2)
    discount = round(subtotal * body.discount_percent / 100, 2)
    tax = round((subtotal - discount) * settings["tax_percent"] / 100, 2)
    total = round(subtotal - discount + tax, 2)
    paid = total if body.paid_amount is None else round(min(body.paid_amount, total), 2)

    with db.tx() as conn:
        seq = conn.execute(
            "SELECT COUNT(*) + 1 FROM orders WHERE date(created_at) = date('now', 'localtime')"
        ).fetchone()[0]
        order_no = f"OB-{datetime.now():%y%m%d}-{seq:03d}"
        oid = conn.execute(
            """INSERT INTO orders (order_no, customer_id, channel, status, subtotal, discount,
                                   tax, total, paid_amount, payment_method, note)
               VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)""",
            (order_no, body.customer_id, body.channel, subtotal, discount, tax, total,
             paid, body.payment_method, body.note),
        ).lastrowid
        conn.executemany(
            """INSERT INTO order_items (order_id, product_id, name, qty, unit_price,
                                        cost_price, line_total)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            [(oid, p["product_id"], p["name"], p["qty"], p["unit_price"],
              p["cost_price"], p["line_total"]) for p in priced],
        )
    return _detail(oid)


@router.get("/{oid}")
def order_detail(oid: int) -> dict:
    return _detail(oid)


@router.patch("/{oid}")
def update_order(oid: int, body: OrderPatch) -> dict:
    order = _detail(oid)
    if body.status:
        if body.status not in STATUSES:
            raise HTTPException(422, f"status must be one of {STATUSES}")
        if order["status"] == "cancelled" and body.status != "cancelled":
            raise HTTPException(409, "cancelled orders cannot be reopened; create a new order")
        db.insert("UPDATE orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                  (body.status, oid))
    if body.paid_amount is not None:
        fresh = db.one("SELECT total FROM orders WHERE id = ?", (oid,))
        db.insert(
            """UPDATE orders SET paid_amount = ?, payment_method = COALESCE(?, payment_method),
                                 updated_at = datetime('now', 'localtime') WHERE id = ?""",
            (round(min(body.paid_amount, fresh["total"]), 2), body.payment_method, oid),
        )
    elif body.payment_method:
        db.insert(
            """UPDATE orders SET payment_method = ?,
                                 updated_at = datetime('now', 'localtime') WHERE id = ?""",
            (body.payment_method, oid),
        )
    return _detail(oid)
