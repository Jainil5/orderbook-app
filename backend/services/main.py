from fastapi import FastAPI, HTTPException, Query
from backend import db
from backend.services.route_models import (agent, ai, analyst, analytics, customers, orders,
                              products, settings)




app = FastAPI(title="OrderBook local")


@app.get("/")
def root() -> dict:
    return {"message": "OrderBook local"}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "data_dir": str(db.DATA_DIR), "products": len(db.read("products"))}


@app.get("/api/settings", tags=["insights"])
def get_settings() -> dict:
    return settings.payload()


@app.get("/api/insights", tags=["insights"])
def get_insights(days: int = 30, date_from: str | None = None,
                 date_to: str | None = None) -> dict:
    try:
        return analytics.snapshot(days, date_from, date_to)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.post("/api/insights/summary", tags=["insights"])
def generate_summary(days: int = 30, date_from: str | None = None,
                     date_to: str | None = None) -> dict:
    try:
        return ai.summarize(days, date_from, date_to)
    except ai.AiUnavailable as exc:
        raise HTTPException(503, f"AI unavailable ({ai.MODEL}): {exc}")


@app.get("/api/dashboard", tags=["insights"])
def get_dashboard() -> dict:
    return analytics.today_view()


@app.get("/api/products", tags=["products"])
def list_products() -> list[dict]:
    return products.listing()


@app.post("/api/products", tags=["products"])
def create_product(body: products.ProductIn) -> dict:
    return products.create(body)


@app.put("/api/products/{pid}", tags=["products"])
def update_product(pid: int, body: products.ProductIn) -> dict:
    return products.update(pid, body)


@app.delete("/api/products/{pid}", tags=["products"])
def deactivate_product(pid: int) -> dict:
    return products.deactivate(pid)


@app.get("/api/customers", tags=["customers"])
def list_customers(q: str | None = None) -> list[dict]:
    return customers.listing(q)


@app.post("/api/customers", tags=["customers"])
def create_customer(body: customers.CustomerIn) -> dict:
    return customers.create(body)


@app.get("/api/customers/{customer_id}", tags=["customers"])
def get_customer(customer_id: int) -> dict:
    return customers.detail(customer_id)


@app.get("/api/orders", tags=["orders"])
def list_orders(status: str | None = None, q: str | None = None,
                limit: int = Query(100, le=500)) -> list[dict]:
    return orders.listing(status, q, limit)


@app.post("/api/orders", tags=["orders"])
def create_order(body: orders.OrderIn) -> dict:
    return orders.create(body)


@app.get("/api/orders/{order_id}", tags=["orders"])
def get_order(order_id: int) -> dict:
    return orders.detail(order_id)


@app.patch("/api/orders/{order_id}", tags=["orders"])
def patch_order(order_id: int, body: orders.OrderPatch) -> dict:
    return orders.update(order_id, body)


@app.get("/api/intelligence/suggestions", tags=["intelligence"])
def suggestions() -> dict:
    return {"suggestions": analyst.SUGGESTIONS, "model": ai.MODEL}


@app.post("/api/intelligence/chat", response_model=analyst.ChatResponse,
          tags=["intelligence"])
def chat(req: analyst.ChatRequest) -> dict:
    try:
        return analyst.chat(req)
    except ai.AiUnavailable as exc:
        raise HTTPException(503, f"AI unavailable ({ai.MODEL}): {exc}")


@app.post("/api/intelligence/agent", tags=["intelligence"])
def ask_agent(req: agent.AgentQuestion) -> dict:
    return agent.ask(req)
