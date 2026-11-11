from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend import db

router = APIRouter(prefix="/api/customers", tags=["customers"])


class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str | None = None
    email: str | None = None


@router.get("")
def list_customers(q: str | None = None) -> list[dict]:
    sql = """SELECT c.*, COUNT(o.id) orders, COALESCE(SUM(o.total), 0) revenue,
                    MAX(o.created_at) last_order_at
             FROM customers c
             LEFT JOIN orders o ON o.customer_id = c.id AND o.status != 'cancelled'
             GROUP BY c.id"""
    if q:
        sql += " HAVING c.name LIKE ? OR c.phone LIKE ?"
        return db.query(sql + " ORDER BY revenue DESC", (f"%{q}%", f"%{q}%"))
    return db.query(sql + " ORDER BY revenue DESC")


@router.post("")
def create_customer(body: CustomerIn) -> dict:
    cid = db.insert(
        "INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)",
        (body.name.strip(), body.phone.strip() if body.phone else None,
         body.email.strip() if body.email else None),
    )
    return db.one("SELECT * FROM customers WHERE id = ?", (cid,))


@router.get("/{cid}")
def customer_detail(cid: int) -> dict:
    row = db.one("SELECT * FROM customers WHERE id = ?", (cid,))
    if not row:
        raise HTTPException(404, f"customer {cid} not found")
    row["orders"] = db.query(
        """SELECT id, order_no, status, total, paid_amount, created_at FROM orders
           WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50""",
        (cid,),
    )
    paid = [o for o in row["orders"] if o["status"] != "cancelled"]
    row["stats"] = {
        "orders": len(paid),
        "revenue": round(sum(o["total"] for o in paid), 2),
        "outstanding": round(sum(max(o["total"] - o["paid_amount"], 0) for o in paid), 2),
    }
    return row
