"""Deterministic analytics. Every number here comes from SQL over SQLite;
the AI layer only narrates this dict and never computes anything itself."""
from datetime import date, timedelta

from backend import db

STATUSES = ["open", "confirmed", "preparing", "ready", "delivered", "cancelled"]
_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


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


def _totals(rng_from: str, rng_to: str) -> dict:
    row = db.one(
        """SELECT COUNT(*) orders,
                  COALESCE(SUM(total), 0) revenue,
                  COALESCE(SUM(discount), 0) discounts,
                  COALESCE(SUM(tax), 0) tax,
                  COALESCE(SUM(total - paid_amount), 0) outstanding
           FROM orders
           WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?""",
        (rng_from, rng_to),
    )
    agg = db.one(
        """SELECT COALESCE(SUM(oi.qty), 0) units,
                  COUNT(*) line_count,
                  COALESCE(SUM(oi.line_total - oi.cost_price * oi.qty), 0) profit
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?""",
        (rng_from, rng_to),
    )
    cancelled = db.one(
        """SELECT COUNT(*) n FROM orders
           WHERE status = 'cancelled' AND date(created_at) BETWEEN ? AND ?""",
        (rng_from, rng_to),
    )["n"]
    orders = row["orders"] or 0
    revenue = round(row["revenue"], 2)
    profit = round(agg["profit"], 2)
    all_orders = orders + cancelled
    return {
        "revenue": revenue,
        "orders": orders,
        "units": int(agg["units"] or 0),
        "aov": round(revenue / orders, 2) if orders else 0.0,
        "gross_profit": profit,
        "margin_pct": round(profit / revenue * 100, 1) if revenue else 0.0,
        "discounts": round(row["discounts"], 2),
        "tax": round(row["tax"], 2),
        "outstanding": round(row["outstanding"], 2),
        "avg_lines_per_order": round((agg["line_count"] or 0) / orders, 2) if orders else 0.0,
        "cancelled": cancelled,
        "cancelled_pct": round(cancelled / all_orders * 100, 1) if all_orders else 0.0,
    }


def _pct(now: float, prev: float) -> float | None:
    if not prev:
        return None
    return round((now - prev) / prev * 100, 1)


def snapshot(days: int = 30, date_from: str | None = None, date_to: str | None = None) -> dict:
    rng = resolve_range(days, date_from, date_to)
    cur = _totals(rng["from"], rng["to"])
    prev = _totals(rng["prev_from"], rng["prev_to"])

    daily = db.query(
        """SELECT date(created_at) day, COALESCE(SUM(total), 0) revenue, COUNT(*) orders
           FROM orders WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?
           GROUP BY day ORDER BY day""",
        (rng["from"], rng["to"]),
    )
    top_products = db.query(
        """SELECT oi.name product, SUM(oi.qty) units, SUM(oi.line_total) revenue,
                  SUM(oi.line_total - oi.cost_price * oi.qty) profit
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
           GROUP BY oi.name ORDER BY revenue DESC LIMIT 8""",
        (rng["from"], rng["to"]),
    )
    margin_by_product = db.query(
        """SELECT oi.name product, SUM(oi.qty) units, SUM(oi.line_total) revenue,
                  SUM(oi.line_total - oi.cost_price * oi.qty) profit,
                  CASE WHEN SUM(oi.line_total) > 0
                       THEN ROUND(SUM(oi.line_total - oi.cost_price * oi.qty) / SUM(oi.line_total) * 100, 1)
                       ELSE 0 END margin_pct
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
           GROUP BY oi.name HAVING SUM(oi.qty) >= 3 ORDER BY margin_pct ASC LIMIT 5""",
        (rng["from"], rng["to"]),
    )
    categories = db.query(
        """SELECT COALESCE(p.category, 'Other') category,
                  SUM(oi.qty) units, SUM(oi.line_total) revenue
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
           WHERE o.status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
           GROUP BY category ORDER BY revenue DESC""",
        (rng["from"], rng["to"]),
    )
    statuses = db.query(
        """SELECT status, COUNT(*) orders, COALESCE(SUM(total), 0) value
           FROM orders WHERE date(created_at) BETWEEN ? AND ?
           GROUP BY status ORDER BY orders DESC""",
        (rng["from"], rng["to"]),
    )
    payments = db.query(
        """SELECT payment_method, COUNT(*) orders, COALESCE(SUM(paid_amount), 0) collected
           FROM orders WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?
           GROUP BY payment_method ORDER BY collected DESC""",
        (rng["from"], rng["to"]),
    )
    top_customers = db.query(
        """SELECT c.name customer, COUNT(o.id) orders, COALESCE(SUM(o.total), 0) revenue
           FROM orders o JOIN customers c ON c.id = o.customer_id
           WHERE o.status != 'cancelled' AND date(o.created_at) BETWEEN ? AND ?
           GROUP BY c.id ORDER BY revenue DESC LIMIT 5""",
        (rng["from"], rng["to"]),
    )
    walkins = db.one(
        """SELECT COUNT(*) orders, COALESCE(SUM(total), 0) revenue FROM orders
           WHERE customer_id IS NULL AND status != 'cancelled'
             AND date(created_at) BETWEEN ? AND ?""",
        (rng["from"], rng["to"]),
    )
    weekday = db.query(
        """SELECT CAST(strftime('%w', created_at) AS INTEGER) dow,
                  COALESCE(SUM(total), 0) revenue, COUNT(*) orders
           FROM orders WHERE status != 'cancelled' AND date(created_at) BETWEEN ? AND ?
           GROUP BY dow ORDER BY dow""",
        (rng["from"], rng["to"]),
    )
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
        "low_margin_products": margin_by_product,
        "categories": categories,
        "statuses": statuses,
        "payments": payments,
        "top_customers": top_customers,
        "walkins": walkins,
        "weekday": [{"day": _WEEKDAYS[r["dow"]], "revenue": round(r["revenue"], 2),
                     "orders": r["orders"]} for r in weekday],
    }


def today_view() -> dict:
    """Compact numbers for the dashboard header."""
    t = date.today().isoformat()
    day = _totals(t, t)
    open_orders = db.query(
        """SELECT id, order_no, status, total, paid_amount, created_at FROM orders
           WHERE status IN ('open', 'confirmed', 'preparing', 'ready')
           ORDER BY created_at DESC LIMIT 25"""
    )
    below_cost = db.query(
        """SELECT id, name, category, price, cost_price FROM products
           WHERE active = 1 AND cost_price >= price ORDER BY name"""
    )
    return {"today": day, "open_orders": open_orders, "below_cost_products": below_cost}
