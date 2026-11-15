"""Deterministic analytics. Every number here is computed from the CSV data;
the AI layer only narrates this dict and never computes anything itself."""
from datetime import date, timedelta

import pandas as pd

from backend import db

STATUSES = ["open", "confirmed", "preparing", "ready", "delivered", "cancelled"]
_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
_OPEN_STATUSES = ["open", "confirmed", "preparing", "ready"]


def resolve_range(days: int = 30, date_from: str | None = None, date_to: str | None = None) -> dict:
    """ISO day ranges, inclusive. Also builds the equal-length window before them."""
    to = date.fromisoformat(date_to) if date_to else date.today()
    if date_from:
        start = date.fromisoformat(date_from)
    else:
        start = to - timedelta(days=max(days, 1) - 1)
    span = (to - start).days + 1
    prev_to = start - timedelta(days=1)
    prev_start = prev_to - timedelta(days=span - 1)
    return {
        "from": start.isoformat(), "to": to.isoformat(), "days": span,
        "prev_from": prev_start.isoformat(), "prev_to": prev_to.isoformat(),
    }


def _frames() -> dict[str, pd.DataFrame]:
    """Load every table once per request, with stable columns even when empty."""
    frames = {t: pd.DataFrame(db.read(t), columns=db.columns(t))
              for t in ("orders", "order_items", "products", "customers")}
    orders = frames["orders"]
    for col in ("subtotal", "discount", "tax", "total", "paid_amount"):
        orders[col] = pd.to_numeric(orders[col], errors="coerce").fillna(0.0)
    orders["day"] = orders["created_at"].astype(str).str.slice(0, 10)
    items = frames["order_items"]
    for col in ("qty", "unit_price", "cost_price", "line_total"):
        items[col] = pd.to_numeric(items[col], errors="coerce").fillna(0.0)
    items["profit"] = items["line_total"] - items["cost_price"] * items["qty"]
    products = frames["products"]
    for col in ("price", "cost_price", "active"):
        products[col] = pd.to_numeric(products[col], errors="coerce").fillna(0.0)
    return frames


def _live_in(orders: pd.DataFrame, rng_from: str, rng_to: str) -> pd.DataFrame:
    """Non-cancelled orders created inside the inclusive day range."""
    return orders[(orders["status"] != "cancelled")
                  & orders["day"].between(rng_from, rng_to)]


def _totals(orders: pd.DataFrame, items: pd.DataFrame, rng_from: str, rng_to: str) -> dict:
    live = _live_in(orders, rng_from, rng_to)
    lines = items[items["order_id"].isin(set(live["id"]))]
    cancelled = int(((orders["status"] == "cancelled")
                     & orders["day"].between(rng_from, rng_to)).sum())

    count = int(len(live))
    revenue = round(float(live["total"].sum()), 2)
    profit = round(float(lines["profit"].sum()), 2)
    all_orders = count + cancelled
    return {
        "revenue": revenue,
        "orders": count,
        "units": int(lines["qty"].sum()),
        "aov": round(revenue / count, 2) if count else 0.0,
        "gross_profit": profit,
        "margin_pct": round(profit / revenue * 100, 1) if revenue else 0.0,
        "discounts": round(float(live["discount"].sum()), 2),
        "tax": round(float(live["tax"].sum()), 2),
        "outstanding": round(float((live["total"] - live["paid_amount"]).sum()), 2),
        "avg_lines_per_order": round(len(lines) / count, 2) if count else 0.0,
        "cancelled": cancelled,
        "cancelled_pct": round(cancelled / all_orders * 100, 1) if all_orders else 0.0,
    }


def _pct(now: float, prev: float) -> float | None:
    if not prev:
        return None
    return round((now - prev) / prev * 100, 1)


def snapshot(days: int = 30, date_from: str | None = None, date_to: str | None = None) -> dict:
    rng = resolve_range(days, date_from, date_to)
    frames = _frames()
    orders, items = frames["orders"], frames["order_items"]
    products, customers = frames["products"], frames["customers"]

    cur = _totals(orders, items, rng["from"], rng["to"])
    prev = _totals(orders, items, rng["prev_from"], rng["prev_to"])

    in_range = orders[orders["day"].between(rng["from"], rng["to"])]
    live = _live_in(orders, rng["from"], rng["to"])
    lines = items[items["order_id"].isin(set(live["id"]))]

    daily = [
        {"day": day, "revenue": round(float(g["total"].sum()), 2), "orders": int(len(g))}
        for day, g in live.groupby("day")
    ]
    daily.sort(key=lambda r: r["day"])

    by_product = lines.groupby("name").agg(
        units=("qty", "sum"), revenue=("line_total", "sum"), profit=("profit", "sum"))
    top_products = [
        {"product": name, "units": int(r["units"]),
         "revenue": round(float(r["revenue"]), 2), "profit": round(float(r["profit"]), 2)}
        for name, r in by_product.sort_values("revenue", ascending=False).head(8).iterrows()
    ]
    with_volume = by_product[by_product["units"] >= 3].copy()
    with_volume["margin_pct"] = [
        round(float(r["profit"]) / float(r["revenue"]) * 100, 1) if r["revenue"] > 0 else 0.0
        for _, r in with_volume.iterrows()
    ]
    low_margin_products = [
        {"product": name, "units": int(r["units"]), "revenue": round(float(r["revenue"]), 2),
         "profit": round(float(r["profit"]), 2), "margin_pct": float(r["margin_pct"])}
        for name, r in with_volume.sort_values("margin_pct").head(5).iterrows()
    ]

    categorized = lines.merge(
        products[["id", "category"]].rename(columns={"id": "product_id"}),
        on="product_id", how="left")
    categorized["category"] = categorized["category"].fillna("Other")
    categories = [
        {"category": cat, "units": int(g["qty"].sum()),
         "revenue": round(float(g["line_total"].sum()), 2)}
        for cat, g in categorized.groupby("category")
    ]
    categories.sort(key=lambda r: r["revenue"], reverse=True)

    statuses = [
        {"status": status, "orders": int(len(g)), "value": round(float(g["total"].sum()), 2)}
        for status, g in in_range.groupby("status")
    ]
    statuses.sort(key=lambda r: r["orders"], reverse=True)

    payments = [
        {"payment_method": method, "orders": int(len(g)),
         "collected": round(float(g["paid_amount"].sum()), 2)}
        for method, g in live.groupby("payment_method")
    ]
    payments.sort(key=lambda r: r["collected"], reverse=True)

    people = customers[["id", "name", "phone"]].copy()
    # A record opened at the counter may hold only a number; the AI facts must
    # never carry a blank name for the model to invent something for.
    display = people["name"].fillna("").astype(str).str.strip()
    display = display.where(display != "", people["phone"].fillna("").astype(str))
    people["customer"] = display.where(display != "", "Customer " + people["id"].astype(str))
    named = live.merge(
        people.rename(columns={"id": "customer_id"})[["customer_id", "customer"]],
        on="customer_id", how="inner")
    top_customers = [
        {"customer": g["customer"].iloc[0], "orders": int(len(g)),
         "revenue": round(float(g["total"].sum()), 2)}
        for _, g in named.groupby("customer_id")
    ]
    top_customers.sort(key=lambda r: r["revenue"], reverse=True)
    top_customers = top_customers[:5]

    walkin_rows = live[live["customer_id"].isna()]
    walkins = {"orders": int(len(walkin_rows)),
               "revenue": round(float(walkin_rows["total"].sum()), 2)}

    weekday = []
    if not live.empty:
        dow = (pd.to_datetime(live["created_at"]).dt.day_of_week + 1) % 7  # Sun=0
        for d, g in live.assign(dow=dow).groupby("dow"):
            weekday.append({"day": _WEEKDAYS[int(d)],
                            "revenue": round(float(g["total"].sum()), 2),
                            "orders": int(len(g))})
        weekday.sort(key=lambda r: _WEEKDAYS.index(r["day"]))

    by_day = sorted(daily, key=lambda r: r["revenue"])
    return {
        "range": rng,
        "totals": cur,
        "previous": {k: prev[k] for k in ("revenue", "orders", "aov", "margin_pct")},
        "change": {
            "revenue_pct": _pct(cur["revenue"], prev["revenue"]),
            "orders_pct": _pct(cur["orders"], prev["orders"]),
            "aov_pct": _pct(cur["aov"], prev["aov"]),
            "margin_pts": round(cur["margin_pct"] - prev["margin_pct"], 1),
        },
        "daily": daily,
        "best_day": by_day[-1] if by_day else None,
        "worst_day": by_day[0] if by_day else None,
        "top_products": top_products,
        "low_margin_products": low_margin_products,
        "categories": categories,
        "statuses": statuses,
        "payments": payments,
        "top_customers": top_customers,
        "walkins": walkins,
        "weekday": weekday,
    }


def today_view() -> dict:
    """Compact numbers for the dashboard header."""
    t = date.today().isoformat()
    frames = _frames()
    orders, items, products = frames["orders"], frames["order_items"], frames["products"]
    day = _totals(orders, items, t, t)
    open_orders = (orders[orders["status"].isin(_OPEN_STATUSES)]
                   .sort_values("created_at", ascending=False)
                   .head(25)[["id", "order_no", "status", "total", "paid_amount", "created_at"]]
                   .to_dict(orient="records"))
    below_cost = (products[(products["active"] == 1)
                           & (products["cost_price"] >= products["price"])]
                  .sort_values("name")[["id", "name", "category", "price", "cost_price"]]
                  .to_dict(orient="records"))
    return {"today": day, "open_orders": open_orders, "below_cost_products": below_cost}
