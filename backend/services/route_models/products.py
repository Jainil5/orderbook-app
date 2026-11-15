"""Product catalogue rules. A delete only deactivates the row, so orders that
already reference the product stay readable."""
from fastapi import HTTPException
from pydantic import BaseModel, Field

from backend import db


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sku: str | None = None
    category: str = "General"
    price: float = Field(ge=0)
    cost_price: float = Field(0, ge=0)
    active: bool = True


def _get(pid: int) -> dict:
    row = db.get("products", pid)
    if not row:
        raise HTTPException(404, f"product {pid} not found")
    return row


def _check_sku(sku: str | None, exclude_id: int | None = None) -> None:
    if sku and any(p["sku"] == sku and p["id"] != exclude_id for p in db.read("products")):
        raise HTTPException(422, f"sku {sku} already exists")


def listing() -> list[dict]:
    return sorted(db.read("products"), key=lambda p: (-p["active"], p["name"]))


def categories() -> list[str]:
    return sorted({p["category"] for p in db.read("products")}) or ["General"]


def create(body: ProductIn) -> dict:
    sku = body.sku.strip() if body.sku else None
    _check_sku(sku)
    return db.insert(
        "products",
        name=body.name.strip(), sku=sku, category=body.category.strip() or "General",
        price=body.price, cost_price=body.cost_price, active=int(body.active),
    )


def update(pid: int, body: ProductIn) -> dict:
    _get(pid)
    sku = body.sku.strip() if body.sku else None
    _check_sku(sku, exclude_id=pid)
    return db.update(
        "products", pid,
        name=body.name.strip(), sku=sku, category=body.category.strip() or "General",
        price=body.price, cost_price=body.cost_price, active=int(body.active),
    )


def deactivate(pid: int) -> dict:
    _get(pid)
    db.update("products", pid, active=0)
    return {"id": pid, "active": False}
