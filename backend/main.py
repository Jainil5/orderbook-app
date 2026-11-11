from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend import db
from backend.routers import customers, insights, intelligence, orders, products


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    app.state.db_path = str(db.DB_PATH)
    yield


app = FastAPI(title="OrderBook local", lifespan=lifespan)
app.include_router(products.router)
app.include_router(customers.router)
app.include_router(orders.router)
app.include_router(insights.router)
app.include_router(intelligence.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "db": str(db.DB_PATH), "products": db.scalar("SELECT COUNT(*) FROM products")}
