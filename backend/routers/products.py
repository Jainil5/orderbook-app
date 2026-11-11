from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend import db

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sku: str | None = None
    category: str = "General"
    price: float = Field(ge=0)
    cost_price: float = Field(0, ge=0)
    active: bool = True


def _get(pid: int) -> dict:
    row = db.one("SELECT * FROM products WHERE id = ?", (pid,))
    if not row:
        raise HTTPException(404, f"product {pid} not found")
    return row


@router.get("")
def list_products() -> list[dict]:
    return db.query("SELECT * FROM products ORDER BY active DESC, name")


@router.post("")
def create_product(body: ProductIn) -> dict:
    pid = db.insert(
        """INSERT INTO products (name, sku, category, price, cost_price, active)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (body.name.strip(), body.sku.strip() if body.sku else None,
         body.category.strip() or "General", body.price, body.cost_price, int(body.active)),
    )
    return _get(pid)


@router.put("/{pid}")
def update_product(pid: int, body: ProductIn) -> dict:
    _get(pid)
    db.insert(
        "UPDATE products SET name = ?, sku = ?, category = ?, price = ?, cost_price = ?,"
        " active = ? WHERE id = ?",
        (body.name.strip(), body.sku.strip() if body.sku else None,
         body.category.strip() or "General", body.price, body.cost_price, int(body.active), pid),
    )
    return _get(pid)


@router.delete("/{pid}")
def deactivate_product(pid: int) -> dict:
    """Products keep their row so past orders stay readable; the tile just stops showing."""
    _get(pid)
    db.insert("UPDATE products SET active = 0 WHERE id = ?", (pid,))
    return {"id": pid, "active": False}
