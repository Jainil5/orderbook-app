"""Customer records and the lifetime stats shown beside them. Cancelled orders
never count towards revenue, but they stay visible on the customer's own list.

The mobile number is the identity, not the name: at a counter the name is often
unknown but the number is given. So numbers are stored as bare digits, matched on
those digits, and used as the display label whenever a name was never captured."""
from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator

from backend import db

_ORDER_FIELDS = ("id", "order_no", "status", "total", "paid_amount", "created_at")


def digits(value: str | None) -> str:
    """Compare key for a phone: strips spaces, dashes and a country prefix sign."""
    return "".join(ch for ch in (value or "") if ch.isdigit())


def label(customer: dict | None) -> str | None:
    if not customer:
        return None
    return customer.get("name") or customer.get("phone") or f"Customer {customer['id']}"


class CustomerIn(BaseModel):
    phone: str = Field(min_length=7, max_length=20)
    name: str | None = Field(None, max_length=80)
    email: str | None = None

    @field_validator("phone")
    @classmethod
    def _digits_only(cls, value: str) -> str:
        cleaned = digits(value)
        if not 7 <= len(cleaned) <= 15:
            raise ValueError("enter a mobile number of 7 to 15 digits")
        return cleaned


def find_by_phone(phone: str) -> dict | None:
    needle = digits(phone)
    if not needle:
        return None
    for row in db.read("customers"):
        if digits(row.get("phone")) == needle:
            return row
    return None


def listing(q: str | None = None) -> list[dict]:
    orders = [o for o in db.read("orders") if o["status"] != "cancelled"]
    rows = []
    for customer in db.read("customers"):
        theirs = [o for o in orders if o["customer_id"] == customer["id"]]
        rows.append({
            **customer,
            "display": label(customer),
            "orders": len(theirs),
            "revenue": round(sum(o["total"] for o in theirs), 2),
            "last_order_at": max((o["created_at"] for o in theirs), default=None),
        })
    if q:
        needle = q.lower()
        rows = [r for r in rows
                if needle in (r["display"] or "").lower()
                or needle in (r["phone"] or "").lower()]
    rows.sort(key=lambda r: r["revenue"], reverse=True)
    return rows


def create(body: CustomerIn) -> dict:
    if find_by_phone(body.phone):
        raise HTTPException(409, f"a customer with {body.phone} already exists")
    return db.insert(
        "customers",
        name=body.name.strip() if body.name and body.name.strip() else None,
        phone=body.phone,
        email=body.email.strip() if body.email else None,
    )


def ensure(phone: str, name: str | None = None) -> dict:
    """The record for this number, creating one from the number alone if unseen."""
    existing = find_by_phone(phone)
    if existing:
        return existing
    return db.insert(
        "customers",
        name=name.strip() if name and name.strip() else None,
        phone=digits(phone),
        email=None,
    )


def detail(cid: int) -> dict:
    row = db.get("customers", cid)
    if not row:
        raise HTTPException(404, f"customer {cid} not found")
    row["display"] = label(row)
    theirs = [o for o in db.read("orders") if o["customer_id"] == cid]
    theirs.sort(key=lambda o: o["created_at"], reverse=True)
    row["orders"] = [{k: o[k] for k in _ORDER_FIELDS} for o in theirs[:50]]
    paid = [o for o in row["orders"] if o["status"] != "cancelled"]
    row["stats"] = {
        "orders": len(paid),
        "revenue": round(sum(o["total"] for o in paid), 2),
        "outstanding": round(sum(max(o["total"] - o["paid_amount"], 0) for o in paid), 2),
    }
    return row
