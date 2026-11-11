from fastapi import APIRouter, HTTPException

from backend import db
from backend.routers import orders as orders_router
from backend.services import ai, analytics

router = APIRouter(prefix="/api", tags=["insights"])


@router.get("/settings")
def settings() -> dict:
    row = db.one("SELECT * FROM settings WHERE id = 1")
    categories = [r["category"] for r in
                  db.query("SELECT DISTINCT category FROM products ORDER BY category")]
    return {**row, "statuses": analytics.STATUSES, "channels": orders_router.CHANNELS,
            "payment_methods": orders_router.PAYMENTS,
            "categories": categories or ["General"]}


@router.get("/insights")
def insights(days: int = 30, date_from: str | None = None, date_to: str | None = None) -> dict:
    try:
        return analytics.snapshot(days, date_from, date_to)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.post("/insights/summary")
def summary(days: int = 30, date_from: str | None = None, date_to: str | None = None) -> dict:
    snapshot = analytics.snapshot(days, date_from, date_to)
    currency = db.one("SELECT currency FROM settings WHERE id = 1")["currency"]
    try:
        return ai.narrate(snapshot, currency)
    except ai.AiUnavailable as exc:
        raise HTTPException(503, f"AI unavailable ({ai.MODEL}): {exc}")


@router.get("/dashboard")
def dashboard() -> dict:
    return analytics.today_view()
