"""Order capture and lifecycle. Totals are always recomputed from products.csv,
so a client can never set its own prices."""
from datetime import date, datetime

from fastapi import HTTPException
from pydantic import BaseModel, Field

from backend import db
from backend.services.route_models import customers
from backend.services.route_models.analytics import STATUSES

CHANNELS = ["counter", "online", "phone"]
PAYMENTS = ["cash", "card", "upi", "credit"]
_ITEM_FIELDS = ("id", "product_id", "name", "qty", "unit_price", "cost_price", "line_total")


class LineIn(BaseModel):
    product_id: int
    qty: int = Field(gt=0, le=999)


class OrderIn(BaseModel):
    items: list[LineIn] = Field(min_length=1)
    customer_id: int | None = None
    customer_phone: str | None = Field(None, max_length=20)
    customer_name: str | None = Field(None, max_length=80)
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


def _customer_name(customer_id: int | None) -> str | None:
    """The label the UI prints: captured name, else the mobile number."""
    if customer_id is None:
        return None
    return customers.label(db.get("customers", customer_id))


def _items_for(oid: int) -> list[dict]:
    items = [i for i in db.read("order_items") if i["order_id"] == oid]
    items.sort(key=lambda i: i["id"])
    return [{k: i[k] for k in _ITEM_FIELDS} for i in items]


def _detail(oid: int) -> dict:
    order = db.get("orders", oid)
    if not order:
        raise HTTPException(404, f"order {oid} not found")
    order["customer_name"] = _customer_name(order["customer_id"])
    order["items"] = _items_for(oid)
    order["outstanding"] = round(max(order["total"] - order["paid_amount"], 0), 2)
    return order


def listing(status: str | None = None, q: str | None = None,
            limit: int = 100) -> list[dict]:
    items = db.read("order_items")
    rows = []
    for order in db.read("orders"):
        if status and order["status"] != status:
            continue
        name = _customer_name(order["customer_id"])
        if q:
            needle = q.lower()
            if needle not in order["order_no"].lower() and needle not in (name or "").lower():
                continue
        rows.append({
            **order,
            "customer_name": name,
            "units": sum(i["qty"] for i in items if i["order_id"] == order["id"]),
        })
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    for r in rows[:limit]:
        r["outstanding"] = round(max(r["total"] - r["paid_amount"], 0), 2)
    return rows[:limit]


def detail(oid: int) -> dict:
    return _detail(oid)


def create(body: OrderIn) -> dict:
    if body.channel not in CHANNELS:
        raise HTTPException(422, f"channel must be one of {CHANNELS}")
    if body.payment_method not in PAYMENTS:
        raise HTTPException(422, f"payment_method must be one of {PAYMENTS}")
    settings = db.get("settings", 1)
    if body.customer_id and not db.get("customers", body.customer_id):
        raise HTTPException(422, "unknown customer_id")
    phone = customers.digits(body.customer_phone)
    if phone and not 7 <= len(phone) <= 15:
        raise HTTPException(422, "customer_phone needs 7 to 15 digits")

    priced: list[dict] = []
    for line in body.items:
        product = db.get("products", line.product_id)
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

    with db.transaction():
        today = date.today().isoformat()
        seq = sum(1 for o in db.read("orders") if o["created_at"][:10] == today) + 1
        order_no = f"OB-{datetime.now():%y%m%d}-{seq:03d}"
        # The number is the key, so an unseen one opens a record here rather than
        # sending the cashier to the customer screen mid-sale.
        customer_id = body.customer_id or (
            customers.ensure(phone, body.customer_name)["id"] if phone else None)
        order = db.insert(
            "orders",
            order_no=order_no, customer_id=customer_id, channel=body.channel,
            status="open", subtotal=subtotal, discount=discount, tax=tax, total=total,
            paid_amount=paid, payment_method=body.payment_method, note=body.note,
        )
        for p in priced:
            db.insert("order_items", order_id=order["id"], **p)
    return _detail(order["id"])


def update(oid: int, body: OrderPatch) -> dict:
    order = _detail(oid)
    changes: dict = {}
    if body.status:
        if body.status not in STATUSES:
            raise HTTPException(422, f"status must be one of {STATUSES}")
        if order["status"] == "cancelled" and body.status != "cancelled":
            raise HTTPException(409, "cancelled orders cannot be reopened; create a new order")
        changes["status"] = body.status
    if body.paid_amount is not None:
        changes["paid_amount"] = round(min(body.paid_amount, order["total"]), 2)
        if body.payment_method:
            changes["payment_method"] = body.payment_method
    elif body.payment_method:
        changes["payment_method"] = body.payment_method
    if body.note is not None:
        changes["note"] = body.note
    if changes:
        db.update("orders", oid, **changes)
    return _detail(oid)
