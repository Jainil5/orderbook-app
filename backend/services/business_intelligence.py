"""
OrderBook Business Intelligence Engine
======================================

Install:
    pip install pandas numpy supabase python-dotenv

Environment (.env):
    SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    SUPABASE_KEY=YOUR_SERVER_SIDE_SUPABASE_KEY

Usage:
    from business_intelligence import fetch_and_build_context

    context = fetch_and_build_context(
        brand_id="YOUR_AUTHORIZED_BRAND_UUID",
        start_date="2026-11-01",
        end_date="2026-11-09",
        timezone="Asia/Kolkata",
    )

    # Pass `context` (a Python dict) to your LLM.
    # Use json.dumps(context, ensure_ascii=False) if your provider expects JSON text.

You can also use the analysis functions directly with DataFrames:
    result = analyze_sales(orders_df, start_date, end_date)
    result = analyze_products(products_df, order_items_df, orders_df,
                              start_date, end_date)
    result = analyze_customers(customers_df, orders_df, order_items_df,
                               start_date, end_date)

Important:
- This file does not execute custom SQL analytics queries. It fetches rows through
  the Supabase client and performs analytics in Pandas.
- `brand_id` MUST be resolved and authorized by your backend from the logged-in
  user's membership. Never trust a brand_id supplied by the browser or the LLM.
- Keep the Supabase secret/service-role key on the server only. Never put it in
  a NEXT_PUBLIC_ variable or send it to the browser.
- The default qualifying order statuses are configurable below. Confirm these
  values match the exact status strings used by your application.
- The current OrderBook schema described to this implementation has no dedicated
  refunds, inventory-movement, or historical product-cost table. Therefore:
    * revenue excludes tax and delivery and subtracts recorded order discounts;
    * refunds cannot be deducted unless represented in your source data;
    * product profit is an estimate using the current products.cost_price;
    * low-selling products are NOT stock-availability adjusted.
"""

from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from supabase import Client, create_client


# ---------------------------------------------------------------------------
# Configuration — adjust these to match the exact status values in your DB.
# ---------------------------------------------------------------------------

QUALIFYING_ORDER_STATUSES = {"completed"}
QUALIFYING_PAYMENT_STATUSES = {"paid"}

TABLES = ("orders", "order_items", "products", "customers", "payments", "offers")
PAGE_SIZE = 1000


# ---------------------------------------------------------------------------
# General helpers
# ---------------------------------------------------------------------------

def _safe_number(value: Any, default: float = 0.0) -> float:
    try:
        if pd.isna(value):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _json_safe(value: Any) -> Any:
    """Convert Pandas/NumPy/date values into JSON-serializable Python values."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if value is pd.NaT or value is pd.NA:
        return None
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def _records(df: pd.DataFrame, limit: int | None = None) -> list[dict]:
    if df is None or df.empty:
        return []
    result = df.head(limit) if limit else df
    return _json_safe(result.replace({np.nan: None}).to_dict(orient="records"))


def _ensure_columns(df: pd.DataFrame, defaults: dict[str, Any]) -> pd.DataFrame:
    df = df.copy() if df is not None else pd.DataFrame()
    for column, default in defaults.items():
        if column not in df.columns:
            df[column] = default
    return df


def _to_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True)


def _date_bounds(
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
) -> tuple[pd.Timestamp, pd.Timestamp]:
    """
    Return UTC bounds. end_date is inclusive when supplied as a date string,
    e.g. 2026-11-09 includes the whole local day.
    """
    start = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date)

    if start.tzinfo is None:
        start = start.tz_localize(timezone)
    else:
        start = start.tz_convert(timezone)

    if end.tzinfo is None:
        end = end.tz_localize(timezone)
    else:
        end = end.tz_convert(timezone)

    # Treat date-only end values as inclusive through the end of that day.
    if isinstance(end_date, date) and not isinstance(end_date, datetime):
        end = end + pd.Timedelta(days=1)
    elif isinstance(end_date, str) and len(end_date.strip()) <= 10:
        end = end + pd.Timedelta(days=1)

    return start.tz_convert("UTC"), end.tz_convert("UTC")


def _period_frame(
    df: pd.DataFrame,
    date_column: str,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str,
) -> pd.DataFrame:
    if df is None or df.empty or date_column not in df.columns:
        return pd.DataFrame(columns=[] if df is None else df.columns)

    start, end = _date_bounds(start_date, end_date, timezone)
    result = df.copy()
    result["_date_utc"] = _to_datetime(result[date_column])
    return result[
        (result["_date_utc"] >= start) &
        (result["_date_utc"] < end)
    ].copy()


def _qualifying_orders(
    orders: pd.DataFrame,
    order_statuses: Iterable[str] | None = None,
    payment_statuses: Iterable[str] | None = None,
) -> pd.DataFrame:
    orders = _ensure_columns(
        orders,
        {
            "order_status": "",
            "payment_status": "",
            "subtotal": 0,
            "item_discount_amount": 0,
            "order_discount_amount": 0,
            "tax_amount": 0,
            "delivery_fee": 0,
            "total_amount": 0,
            "amount_paid": 0,
            "customer_id": None,
            "created_at": None,
        },
    )

    order_statuses = set(order_statuses or QUALIFYING_ORDER_STATUSES)
    payment_statuses = set(payment_statuses or QUALIFYING_PAYMENT_STATUSES)

    result = orders[
        orders["order_status"].astype(str).str.lower().isin(
            {x.lower() for x in order_statuses}
        )
        & orders["payment_status"].astype(str).str.lower().isin(
            {x.lower() for x in payment_statuses}
        )
    ].copy()

    numeric_columns = [
        "subtotal", "item_discount_amount", "order_discount_amount",
        "tax_amount", "delivery_fee", "total_amount", "amount_paid",
    ]
    for column in numeric_columns:
        result[column] = pd.to_numeric(result[column], errors="coerce").fillna(0)

    # Revenue excludes tax and delivery and subtracts recorded discounts.
    result["gross_sales"] = result["subtotal"]
    result["net_sales"] = (
        result["subtotal"]
        - result["item_discount_amount"]
        - result["order_discount_amount"]
    ).clip(lower=0)

    return result


def _empty_summary() -> dict:
    return {
        "gross_sales": 0.0,
        "net_sales": 0.0,
        "orders": 0,
        "average_order_value": 0.0,
        "amount_collected": 0.0,
    }


def _summary(orders: pd.DataFrame) -> dict:
    if orders.empty:
        return _empty_summary()

    order_count = int(len(orders))
    net_sales = float(orders["net_sales"].sum())
    return {
        "gross_sales": round(float(orders["gross_sales"].sum()), 2),
        "net_sales": round(net_sales, 2),
        "orders": order_count,
        "average_order_value": round(net_sales / order_count, 2) if order_count else 0,
        "amount_collected": round(float(orders["amount_paid"].sum()), 2),
    }


# ---------------------------------------------------------------------------
# Sales analytics
# ---------------------------------------------------------------------------

def analyze_sales(
    orders_df: pd.DataFrame,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
    order_statuses: Iterable[str] | None = None,
    payment_statuses: Iterable[str] | None = None,
) -> dict:
    orders = _qualifying_orders(orders_df, order_statuses, payment_statuses)
    period = _period_frame(orders, "created_at", start_date, end_date, timezone)

    if period.empty:
        return {
            "summary": _empty_summary(),
            "daily_trend": [],
            "monthly_trend": [],
            "payment_methods": [],
            "best_day": None,
            "worst_day": None,
        }

    period["_local_date"] = (
        period["_date_utc"].dt.tz_convert(timezone).dt.date.astype(str)
    )
    daily = (
        period.groupby("_local_date", as_index=False)
        .agg(revenue=("net_sales", "sum"), orders=("id", "count"))
        .sort_values("_local_date")
    )

    period["_local_month"] = (
        period["_date_utc"].dt.tz_convert(timezone).dt.strftime("%Y-%m")
    )
    monthly = (
        period.groupby("_local_month", as_index=False)
        .agg(revenue=("net_sales", "sum"), orders=("id", "count"))
        .sort_values("_local_month")
    )

    period = _ensure_columns(period, {"payment_method": "unknown"})
    payment = (
        period.groupby("payment_method", dropna=False, as_index=False)
        .agg(revenue=("net_sales", "sum"), orders=("id", "count"))
        .sort_values("revenue", ascending=False)
    )

    daily_records = _records(daily)
    best_day = daily.sort_values("revenue", ascending=False).head(1)
    worst_day = daily.sort_values("revenue", ascending=True).head(1)

    return _json_safe({
        "summary": _summary(period),
        "daily_trend": daily_records,
        "monthly_trend": _records(monthly),
        "payment_methods": _records(payment),
        "best_day": _records(best_day)[0] if not best_day.empty else None,
        "worst_day": _records(worst_day)[0] if not worst_day.empty else None,
    })


# ---------------------------------------------------------------------------
# Product analytics
# ---------------------------------------------------------------------------

def analyze_products(
    products_df: pd.DataFrame,
    order_items_df: pd.DataFrame,
    orders_df: pd.DataFrame,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
    order_statuses: Iterable[str] | None = None,
    payment_statuses: Iterable[str] | None = None,
    top_n: int = 10,
) -> dict:
    products = _ensure_columns(
        products_df,
        {"id": None, "name": "Unknown", "category": "Uncategorized",
         "price": 0, "cost_price": 0, "is_active": True},
    )
    items = _ensure_columns(
        order_items_df,
        {"order_id": None, "product_id": None, "product_name": "Unknown",
         "category": "Uncategorized", "quantity": 0, "unit_price": 0,
         "line_total": 0},
    )

    eligible_orders = _qualifying_orders(
        orders_df, order_statuses, payment_statuses
    )
    eligible_period = _period_frame(
        eligible_orders, "created_at", start_date, end_date, timezone
    )

    if eligible_period.empty or items.empty:
        return {
            "top_products": [],
            "lowest_selling_products": [],
            "category_performance": [],
            "product_count": int(len(products)),
        }

    valid_order_ids = set(eligible_period["id"].astype(str))
    items = items[items["order_id"].astype(str).isin(valid_order_ids)].copy()

    items["quantity"] = pd.to_numeric(items["quantity"], errors="coerce").fillna(0)
    items["line_total"] = pd.to_numeric(items["line_total"], errors="coerce").fillna(0)

    # Prefer the product name/category snapshot saved on the order item.
    grouped = (
        items.groupby(["product_id", "product_name", "category"], dropna=False)
        .agg(
            units_sold=("quantity", "sum"),
            revenue=("line_total", "sum"),
            orders=("order_id", "nunique"),
        )
        .reset_index()
    )

    cost_lookup = products[["id", "cost_price"]].copy()
    cost_lookup["cost_price"] = pd.to_numeric(
        cost_lookup["cost_price"], errors="coerce"
    ).fillna(0)
    grouped = grouped.merge(
        cost_lookup, left_on="product_id", right_on="id", how="left"
    )
    grouped["estimated_cogs"] = grouped["units_sold"] * grouped["cost_price"].fillna(0)
    grouped["estimated_gross_profit"] = grouped["revenue"] - grouped["estimated_cogs"]
    grouped["estimated_margin_percent"] = np.where(
        grouped["revenue"] > 0,
        grouped["estimated_gross_profit"] / grouped["revenue"] * 100,
        0,
    )

    product_columns = [
        "product_id", "product_name", "category", "units_sold", "revenue",
        "orders", "estimated_gross_profit", "estimated_margin_percent",
    ]
    top = grouped.sort_values(["units_sold", "revenue"], ascending=False)
    lowest = grouped.sort_values(["units_sold", "revenue"], ascending=True)

    category = (
        grouped.groupby("category", dropna=False, as_index=False)
        .agg(
            units_sold=("units_sold", "sum"),
            revenue=("revenue", "sum"),
            estimated_gross_profit=("estimated_gross_profit", "sum"),
        )
        .sort_values("revenue", ascending=False)
    )

    return _json_safe({
        "top_products": _records(top[product_columns], top_n),
        "lowest_selling_products": _records(lowest[product_columns], top_n),
        "category_performance": _records(category),
        "product_count": int(len(products)),
        "notes": [
            "Lowest-selling products are ranked by sales in the selected period; stock availability is not considered.",
            "Profit is estimated using current products.cost_price, not historical cost at the time of sale.",
        ],
    })


# ---------------------------------------------------------------------------
# Customer analytics
# ---------------------------------------------------------------------------

def analyze_customers(
    customers_df: pd.DataFrame,
    orders_df: pd.DataFrame,
    order_items_df: pd.DataFrame,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
    order_statuses: Iterable[str] | None = None,
    payment_statuses: Iterable[str] | None = None,
    top_n: int = 10,
) -> dict:
    customers = _ensure_columns(
        customers_df,
        {"id": None, "customer_name": "Unknown", "email": None},
    )
    all_orders = _qualifying_orders(
        orders_df, order_statuses, payment_statuses
    )
    all_orders["_date_utc"] = _to_datetime(all_orders["created_at"])
    start, end = _date_bounds(start_date, end_date, timezone)

    history = all_orders[
        (all_orders["_date_utc"] < end)
        & all_orders["customer_id"].notna()
    ].copy()
    period = history[history["_date_utc"] >= start].copy()
    prior = history[history["_date_utc"] < start].copy()

    if period.empty:
        return {
            "summary": {
                "purchasing_customers": 0,
                "new_customers": 0,
                "returning_customers": 0,
                "repeat_customers": 0,
                "repeat_customer_rate_percent": 0.0,
            },
            "top_customers": [],
            "customer_favourites": [],
        }

    period_ids = set(period["customer_id"].astype(str))
    prior_ids = set(prior["customer_id"].astype(str))
    returning_ids = period_ids.intersection(prior_ids)

    lifetime_counts = history.groupby("customer_id")["id"].nunique()
    repeat_ids = set(
        lifetime_counts[lifetime_counts >= 2].index.astype(str)
    )
    repeat_period_ids = period_ids.intersection(repeat_ids)
    new_ids = period_ids.difference(prior_ids)

    customer_spend = (
        period.groupby("customer_id", as_index=False)
        .agg(
            orders=("id", "nunique"),
            spend=("net_sales", "sum"),
            last_purchase=("_date_utc", "max"),
        )
    )
    customer_spend["average_order_value"] = (
        customer_spend["spend"] / customer_spend["orders"].replace(0, np.nan)
    ).fillna(0)

    customer_spend = customer_spend.merge(
        customers[["id", "customer_name", "email"]],
        left_on="customer_id", right_on="id", how="left",
    )
    customer_spend = customer_spend.drop(columns=["id"], errors="ignore")
    customer_spend = customer_spend.sort_values("spend", ascending=False)

    # Favourite products are based on units purchased by each customer.
    period_order_ids = set(period["id"].astype(str))
    items = _ensure_columns(
        order_items_df,
        {"order_id": None, "product_name": "Unknown", "quantity": 0},
    )
    customer_orders = period[["id", "customer_id"]].copy()
    customer_orders["id"] = customer_orders["id"].astype(str)
    items = items[items["order_id"].astype(str).isin(period_order_ids)].copy()
    items["quantity"] = pd.to_numeric(items["quantity"], errors="coerce").fillna(0)
    items = items.merge(
        customer_orders, left_on=items["order_id"].astype(str),
        right_on="id", how="inner",
    )
    favourites = (
        items.groupby(["customer_id", "product_name"], as_index=False)
        .agg(units_purchased=("quantity", "sum"))
        .sort_values(["customer_id", "units_purchased"], ascending=[True, False])
        .groupby("customer_id", as_index=False)
        .head(3)
    )

    total_buyers = len(period_ids)
    repeat_rate = (
        len(repeat_period_ids) / total_buyers * 100 if total_buyers else 0
    )

    return _json_safe({
        "summary": {
            "purchasing_customers": total_buyers,
            "new_customers": len(new_ids),
            "returning_customers": len(returning_ids),
            "repeat_customers": len(repeat_period_ids),
            "repeat_customer_rate_percent": round(repeat_rate, 2),
            "definition": (
                "Repeat customer rate = customers purchasing in the selected "
                "period who have at least two qualifying purchases up to the "
                "end of that period, divided by purchasing customers in the period."
            ),
        },
        "top_customers": _records(customer_spend, top_n),
        "customer_favourites": _records(favourites, top_n * 3),
    })




# ---------------------------------------------------------------------------
# Payments and offer analytics
# ---------------------------------------------------------------------------

def analyze_payments(
    payments_df: pd.DataFrame,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
) -> dict:
    payments = _ensure_columns(
        payments_df,
        {"amount": 0, "payment_method": "unknown",
         "payment_status": "", "paid_at": None},
    )
    period = _period_frame(payments, "paid_at", start_date, end_date, timezone)
    if period.empty:
        return {"total_collected": 0.0, "payment_count": 0, "by_method": []}

    period["amount"] = pd.to_numeric(
        period["amount"], errors="coerce"
    ).fillna(0)
    paid = period[
        period["payment_status"].astype(str).str.lower().isin(
            {"paid", "completed", "success", "succeeded"}
        )
    ]
    by_method = (
        paid.groupby("payment_method", dropna=False, as_index=False)
        .agg(amount=("amount", "sum"), payments=("amount", "count"))
        .sort_values("amount", ascending=False)
    )
    return _json_safe({
        "total_collected": round(float(paid["amount"].sum()), 2),
        "payment_count": int(len(paid)),
        "by_method": _records(by_method),
    })


def analyze_offers(
    orders_df: pd.DataFrame,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
) -> dict:
    orders = _ensure_columns(
        orders_df,
        {"coupon_code": None, "order_discount_amount": 0,
         "created_at": None, "order_status": ""},
    )
    period = _period_frame(orders, "created_at", start_date, end_date, timezone)
    if period.empty:
        return {"orders_using_offers": 0, "discount_amount": 0.0, "offers": []}

    period["order_discount_amount"] = pd.to_numeric(
        period["order_discount_amount"], errors="coerce"
    ).fillna(0)
    used = period[period["coupon_code"].notna() & (period["coupon_code"] != "")]
    grouped = (
        used.groupby("coupon_code", as_index=False)
        .agg(
            orders=("id", "nunique"),
            discount_amount=("order_discount_amount", "sum"),
        )
        .sort_values("orders", ascending=False)
    )
    return _json_safe({
        "orders_using_offers": int(used["id"].nunique()),
        "discount_amount": round(float(used["order_discount_amount"].sum()), 2),
        "offers": _records(grouped),
    })


# ---------------------------------------------------------------------------
# Full business context
# ---------------------------------------------------------------------------

def build_business_context(
    data: dict[str, pd.DataFrame],
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
    brand_id: str | None = None,
) -> dict:
    """Build one compact, JSON-safe analytics context from already-loaded DFs."""
    orders = data.get("orders", pd.DataFrame())
    items = data.get("order_items", pd.DataFrame())
    products = data.get("products", pd.DataFrame())
    customers = data.get("customers", pd.DataFrame())
    payments = data.get("payments", pd.DataFrame())

    sales = analyze_sales(orders, start_date, end_date, timezone)
    product_analysis = analyze_products(
        products, items, orders, start_date, end_date, timezone
    )
    customer_analysis = analyze_customers(
        customers, orders, items, start_date, end_date, timezone
    )
    payment_analysis = analyze_payments(
        payments, start_date, end_date, timezone
    )
    offer_analysis = analyze_offers(
        orders, start_date, end_date, timezone
    )

    return _json_safe({
        "schema_version": "1.0",
        "business_id": brand_id,
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
            "timezone": timezone,
        },
        "sales_analytics": sales,
        "product_analytics": product_analysis,
        "customer_analytics": customer_analysis,
        "payment_analytics": payment_analysis,
        "offer_analytics": offer_analysis,
        "data_quality_notes": [
            "Only completed orders with paid payment status are included by default.",
            "Change QUALIFYING_ORDER_STATUSES and QUALIFYING_PAYMENT_STATUSES to match your business rules.",
            "Refunds are not deducted unless refund data is available in the database.",
            "Historical product costs and inventory availability are not currently modeled.",
        ],
    })


# ---------------------------------------------------------------------------
# Supabase data loading
# ---------------------------------------------------------------------------

def _fetch_all_rows(
    client: Client,
    table_name: str,
    brand_id: str,
    page_size: int = PAGE_SIZE,
) -> pd.DataFrame:
    """Fetch every page for one brand. No analytics SQL is executed."""
    rows: list[dict] = []
    offset = 0

    while True:
        response = (
            client.table(table_name)
            .select("*")
            .eq("brand_id", brand_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)

        if len(batch) < page_size:
            break
        offset += page_size

    return pd.DataFrame(rows)


def fetch_business_data(
    brand_id: str,
    supabase_url: str | None = None,
    supabase_key: str | None = None,
) -> dict[str, pd.DataFrame]:
    """
    Fetch OrderBook tables for a single brand.

    `brand_id` must already have been authorized by your backend.
    The key must be server-side. Prefer a user-scoped authenticated client
    where practical; a service-role key bypasses RLS, so this function still
    applies an explicit brand_id filter but your API must authorize it first.
    """
    load_dotenv()

    url = supabase_url or os.getenv("SUPABASE_URL")
    key = (
        supabase_key
        or os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    if not url:
        raise ValueError("SUPABASE_URL is missing.")
    if not key:
        raise ValueError(
            "SUPABASE_KEY or SUPABASE_SERVICE_ROLE_KEY is missing."
        )
    if not brand_id:
        raise ValueError("brand_id is required.")

    client = create_client(url, key)
    return {
        table: _fetch_all_rows(client, table, brand_id)
        for table in TABLES
    }


def fetch_and_build_context(
    brand_id: str,
    start_date: str | date | datetime,
    end_date: str | date | datetime,
    timezone: str = "Asia/Kolkata",
    supabase_url: str | None = None,
    supabase_key: str | None = None,
) -> dict:
    """Convenience function: fetch live Supabase data and build final JSON."""
    data = fetch_business_data(
        brand_id=brand_id,
        supabase_url=supabase_url,
        supabase_key=supabase_key,
    )
    return build_business_context(
        data=data,
        start_date=start_date,
        end_date=end_date,
        timezone=timezone,
        brand_id=brand_id,
    )


if __name__ == "__main__":
    # Quick local test. Set BRAND_ID in your server-side .env.
    load_dotenv()
    brand = os.getenv("BRAND_ID")
    if not brand:
        raise SystemExit("Set BRAND_ID in .env before running this file.")

    today = pd.Timestamp.now(tz="Asia/Kolkata").date()
    first_day = today.replace(day=1)

    context = fetch_and_build_context(
        brand_id=brand,
        start_date=first_day.isoformat(),
        end_date=today.isoformat(),
    )

    print(json.dumps(context, indent=2, ensure_ascii=False))
