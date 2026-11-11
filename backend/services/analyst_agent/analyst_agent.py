"""
OrderBook Analyst Agent
=======================

Single entry point for OrderBook Business Intelligence.

Flow:
    Natural-language question
        -> query_analyzer.analyze_query()
        -> validated analytics plan
        -> business_intelligence.fetch_business_data()
        -> selected Pandas analytics functions
        -> compact BI JSON
        -> AI Sales Analyst
        -> business-owner-friendly answer

Install:
    pip install langchain langchain-openai python-dotenv pandas numpy supabase

Required .env:
    SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    SUPABASE_KEY=YOUR_SERVER_SIDE_KEY
    BRAND_ID=your-authorized-brand-uuid
    LLM_API_KEY=your-provider-api-key
    LLM_BASE_URL=https://api.openai.com/v1
    LLM_MODEL=your-model-name

Optional:
    BUSINESS_TIMEZONE=Asia/Kolkata

Usage:
    from analyst_agent import ask_business_analyst

    result = ask_business_analyst(
        "Which products sold best in the last 7 days compared with the previous week?",
        brand_id=authorized_brand_id,
    )
    print(result["answer"])

Security:
    - brand_id must be resolved and authorized by your authenticated API.
    - Never accept tenant identity from the LLM or trust a browser-supplied ID.
    - Keep Supabase service-role keys on the server only.
    - Do not expose this module's credentials or raw database data to clients.
"""

from __future__ import annotations

import json
import os
from datetime import date, datetime
from typing import Any

from dotenv import load_dotenv
from model import llm, AI_SALES_ANALYST_NAME

from query_analyzer import analyze_query
from business_intelligence import (
    analyze_sales,
    analyze_products,
    analyze_customers,
    analyze_payments,
    analyze_offers,
    build_business_context,
    fetch_business_data,
)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _json_default(value: Any) -> Any:
    """Fallback serializer for dates and common NumPy scalar values."""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return str(value)


def _json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=_json_default, ensure_ascii=False))


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _period_from_plan(plan: dict, key: str = "period") -> tuple[str, str]:
    period = plan.get(key) or {}
    start = period.get("start_date")
    end = period.get("end_date")
    if not start or not end:
        raise ValueError(f"Analytics plan is missing {key} date boundaries.")
    return start, end


def _filter_data_for_plan(data: dict, filters: dict) -> tuple[dict, list[str]]:
    """
    Apply supported entity filters to copies of the relevant DataFrames.
    This does not alter the source frames.

    Product/category filters constrain order items and their matching orders.
    Customer filters constrain customer orders. Payment method and order status
    constrain orders. Unrecognized/no-match filters are reported as warnings.
    """
    import pandas as pd

    filtered = {name: frame.copy() for name, frame in data.items()}
    warnings: list[str] = []
    orders = filtered.get("orders", pd.DataFrame())
    items = filtered.get("order_items", pd.DataFrame())
    customers = filtered.get("customers", pd.DataFrame())

    if orders.empty:
        return filtered, warnings

    if filters.get("order_status") and "order_status" in orders.columns:
        wanted = str(filters["order_status"]).strip().lower()
        orders = orders[
            orders["order_status"].astype(str).str.lower() == wanted
        ].copy()

    if filters.get("payment_method") and "payment_method" in orders.columns:
        wanted = str(filters["payment_method"]).strip().lower()
        orders = orders[
            orders["payment_method"].astype(str).str.lower() == wanted
        ].copy()

    customer_name = filters.get("customer_name")
    if customer_name:
        if not customers.empty and {"id", "customer_name"}.issubset(customers.columns):
            mask = customers["customer_name"].astype(str).str.contains(
                str(customer_name), case=False, regex=False, na=False
            )
            customer_ids = set(customers.loc[mask, "id"].astype(str))
            if customer_ids:
                orders = orders[
                    orders["customer_id"].astype(str).isin(customer_ids)
                ].copy()
            else:
                warnings.append(
                    f"No customer matched the requested name: {customer_name}."
                )
                orders = orders.iloc[0:0].copy()
        else:
            warnings.append("Customer-name filtering is unavailable in this dataset.")

    product_name = filters.get("product_name")
    category = filters.get("category")
    if product_name or category:
        if items.empty:
            warnings.append("Product/category filter requested, but no order items were loaded.")
            orders = orders.iloc[0:0].copy()
        else:
            item_mask = pd.Series(True, index=items.index)
            if product_name and "product_name" in items.columns:
                item_mask &= items["product_name"].astype(str).str.contains(
                    str(product_name), case=False, regex=False, na=False
                )
            if category and "category" in items.columns:
                item_mask &= items["category"].astype(str).str.contains(
                    str(category), case=False, regex=False, na=False
                )
            matched_items = items[item_mask].copy()
            matched_order_ids = set(matched_items["order_id"].astype(str))
            orders = orders[orders["id"].astype(str).isin(matched_order_ids)].copy()
            filtered["order_items"] = matched_items
            if not matched_order_ids:
                warnings.append("No order items matched the requested product/category filter.")

    filtered["orders"] = orders
    return filtered, warnings


# ---------------------------------------------------------------------------
# BI dispatch — execute only the analytics requested by the query plan
# ---------------------------------------------------------------------------

def execute_business_intelligence(
    data: dict,
    plan: dict,
    brand_id: str,
    top_n: int = 10,
) -> dict:
    """
    Convert loaded DataFrames and a query plan into compact BI JSON.

    For broad questions, build the complete business context. For focused
    questions, call only the required analytics functions. If a comparison is
    requested, run the same selected analytics for the comparison period.
    """
    timezone = (plan.get("period") or {}).get("timezone", "Asia/Kolkata")
    start_date, end_date = _period_from_plan(plan)
    filters = plan.get("filters") or {}

    if plan.get("clarification_required"):
        return {
            "status": "clarification_required",
            "message": plan.get("clarification_question"),
            "period": {"start_date": start_date, "end_date": end_date},
            "analytics": {},
        }

    scoped_data, filter_warnings = _filter_data_for_plan(data, filters)

    def run_selected(sdate: str, edate: str) -> dict:
        domains = set(plan.get("domains") or [])
        intent = plan.get("intent", "")
        full = bool(plan.get("requires_full_context")) or intent == "business_overview"

        if full:
            return build_business_context(
                scoped_data, sdate, edate, timezone=timezone, brand_id=brand_id
            )

        # Resolve the minimal useful domain set from intent if the classifier
        # omitted a domain. This remains deterministic and does not call an LLM.
        if not domains:
            intent_domain_map = {
                "sales_overview": {"sales"},
                "sales_trend": {"sales", "trends"},
                "sales_comparison": {"sales", "trends"},
                "product_performance": {"products"},
                "product_comparison": {"products"},
                "customer_analysis": {"customers"},
                "customer_retention": {"customers", "retention"},
                "customer_favourites": {"customers", "products"},
                "customer_lookup": {"customers"},
                "payment_analysis": {"payments"},
                "offer_analysis": {"offers"},
                "profitability_analysis": {"products", "profitability"},
                "anomaly_detection": {"sales", "trends"},
                "forecasting": {"sales", "trends"},
                "business_insights": {"sales", "products", "customers"},
            }
            domains = intent_domain_map.get(intent, {"sales"})

        result: dict[str, Any] = {
            "schema_version": "1.0",
            "business_id": brand_id,
            "period": {
                "start_date": sdate,
                "end_date": edate,
                "timezone": timezone,
            },
        }

        if domains.intersection({"sales", "trends", "business"}):
            result["sales_analytics"] = analyze_sales(
                scoped_data.get("orders"), sdate, edate, timezone
            )

        if domains.intersection({"products", "profitability"}):
            result["product_analytics"] = analyze_products(
                scoped_data.get("products"),
                scoped_data.get("order_items"),
                scoped_data.get("orders"),
                sdate, edate, timezone, top_n=top_n,
            )

        if domains.intersection({"customers", "retention"}):
            result["customer_analytics"] = analyze_customers(
                scoped_data.get("customers"),
                scoped_data.get("orders"),
                scoped_data.get("order_items"),
                sdate, edate, timezone, top_n=top_n,
            )

        if "payments" in domains:
            result["payment_analytics"] = analyze_payments(
                scoped_data.get("payments"), sdate, edate, timezone
            )

        if "offers" in domains:
            result["offer_analytics"] = analyze_offers(
                scoped_data.get("orders"), sdate, edate, timezone
            )

        result["data_quality_notes"] = [
            "Analytics are calculated from the selected brand's records using Pandas.",
            "Only completed orders with paid payment status are included by default in sales/product/customer metrics.",
            "Refunds are not deducted unless refund data is available in the database.",
            "Estimated product profit uses the current products.cost_price, not historical cost.",
        ]
        return _json_safe(result)

    current = run_selected(start_date, end_date)

    comparison_plan = plan.get("comparison") or {}
    comparison_start = comparison_plan.get("start_date")
    comparison_end = comparison_plan.get("end_date")
    comparison_type = comparison_plan.get("type", "none")

    comparison = None
    if comparison_type != "none" and comparison_start and comparison_end:
        comparison = run_selected(comparison_start, comparison_end)

    return _json_safe({
        "status": "ok",
        "current_period": current,
        "comparison_period": comparison,
        "comparison_type": comparison_type,
        "filters_applied": {
            key: value for key, value in filters.items() if value is not None
        },
        "warnings": filter_warnings,
    })


# ---------------------------------------------------------------------------
# Analyst LLM
# ---------------------------------------------------------------------------

ANALYST_SYSTEM_PROMPT = f"""
You are {AI_SALES_ANALYST_NAME}, OrderBook's senior business analyst for small-business owners.

You receive:
1. The owner's original question.
2. A validated query plan.
3. A BI JSON payload containing calculated metrics.

Your job is to summarize what the supplied data says in clear, practical language.

Rules:
- Treat BI JSON as the only source of business figures. Never invent, estimate,
  or silently recalculate numbers.
- Do not claim a metric exists if it is absent from the BI JSON.
- Explain the selected date range and comparison range when relevant.
- Report the current state of the data only. Do not give recommendations, next
  steps, action plans, or advice — not even suggestions tied to the numbers.
- Do not tell the owner what to do, stock, price, hire, or change.
- Interpretations are allowed only as descriptions of what the figures show;
  never extend them into proposed actions.
- Explain limitations from data_quality_notes and warnings when they matter.
- If the sample is small, say that conclusions are directional, not definitive.
- Do not claim causation from correlation.
- If the question asks for a forecast, anomaly, or metric not actually supplied,
  explain that the current analytics payload does not yet calculate it.
- Keep the answer concise but useful to a business owner. Use headings and
  bullets when they improve clarity.
- If the BI status is clarification_required, ask the clarification question
  instead of attempting an analysis.
"""


def generate_business_answer(
    question: str,
    plan: dict,
    bi_json: dict,
) -> str:
    user_payload = {
        "original_question": question,
        "query_plan": plan,
        "business_intelligence": bi_json,
    }

    response = llm.invoke([
        ("system", ANALYST_SYSTEM_PROMPT),
        (
            "human",
            json.dumps(user_payload, ensure_ascii=False, default=_json_default),
        ),
    ])

    answer = response.content
    if isinstance(answer, list):
        answer = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in answer
        )

    answer = str(answer).strip()
    if not answer:
        raise ValueError("AI Sales Analyst returned an empty answer.")
    return answer


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def ask_business_analyst(
    question: str,
    brand_id: str,
    timezone: str | None = None,
    top_n: int = 10,
    supabase_url: str | None = None,
    supabase_key: str | None = None,
    run_analyst_llm: bool = True,
) -> dict:
    """
    End-to-end OrderBook BI request.

    Returns:
        {
          "question": ...,
          "query_plan": {...},
          "bi_json": {...},
          "answer": "..."
        }

    `brand_id` must already be authorized by the calling backend.
    Set run_analyst_llm=False to inspect/test classification and BI output
    without making the final analyst model call.
    """
    if not isinstance(question, str) or not question.strip():
        raise ValueError("question must be a non-empty string.")
    if not brand_id:
        raise ValueError("An authorized brand_id is required.")

    load_dotenv()
    resolved_timezone = (
        timezone or os.getenv("BUSINESS_TIMEZONE") or "Asia/Kolkata"
    )

    # Stage 1: classify the owner's question.
    plan = analyze_query(
        question=question.strip(),
        timezone=resolved_timezone,
    )

    # If clarification is required, do not fetch business data.
    if plan.get("clarification_required"):
        bi_json = {
            "status": "clarification_required",
            "message": plan.get("clarification_question"),
        }
        answer = (
            plan.get("clarification_question")
            if not run_analyst_llm
            else generate_business_answer(question, plan, bi_json)
        )
        return {
            "question": question,
            "query_plan": plan,
            "bi_json": bi_json,
            "answer": answer,
        }

    # Stage 2: load this brand's data and run only the selected BI calculations.
    data = fetch_business_data(
        brand_id=brand_id,
        supabase_url=supabase_url,
        supabase_key=supabase_key,
    )
    bi_json = execute_business_intelligence(
        data=data,
        plan=plan,
        brand_id=brand_id,
        top_n=top_n,
    )

    # Stage 3: analyst LLM explains the deterministic BI result.
    answer = None
    if run_analyst_llm:
        answer = generate_business_answer(
            question=question.strip(),
            plan=plan,
            bi_json=bi_json,
        )

    return {
        "question": question.strip(),
        "query_plan": plan,
        "bi_json": bi_json,
        "answer": answer,
    }


if __name__ == "__main__":
    import pprint

    query = "Which products sold best in the last 7 days compared with the previous week?"
    brand = os.getenv("BRAND_ID") or "default-brand"

    print("=" * 60)
    print(f"Question: {query}")
    print("=" * 60)

    # 1. Analyze query plan
    plan = analyze_query(query)
    print("\n--- 1. Query Plan ---")
    pprint.pprint(plan)

    # 2. Check if Supabase credentials are configured for live data fetch
    supabase_configured = bool(
        os.getenv("SUPABASE_URL")
        and not os.getenv("SUPABASE_URL", "").startswith("https://YOUR_PROJECT")
        and os.getenv("SUPABASE_KEY")
    )

    if supabase_configured:
        print("\n--- Running End-to-End ask_business_analyst ---")
        result = ask_business_analyst(query, brand_id=brand)
        print("\n--- Final Answer ---")
        print(result["answer"])
    else:
        print("\n[NOTE] Live Supabase credentials not set in .env.")
        print("Executing BI pipeline using sample / mocked business data...")
        import pandas as pd
        sample_data = {
            "orders": pd.DataFrame([
                {
                    "id": "ord-1",
                    "order_status": "completed",
                    "payment_status": "paid",
                    "total_amount": 1200.0,
                    "subtotal": 1200.0,
                    "customer_id": "cust-1",
                    "created_at": datetime.now().isoformat(),
                },
                {
                    "id": "ord-2",
                    "order_status": "completed",
                    "payment_status": "paid",
                    "total_amount": 850.0,
                    "subtotal": 850.0,
                    "customer_id": "cust-2",
                    "created_at": datetime.now().isoformat(),
                },
            ]),
            "order_items": pd.DataFrame([
                {
                    "id": "item-1",
                    "order_id": "ord-1",
                    "product_id": "prod-1",
                    "product_name": "Signature Cold Brew",
                    "quantity": 4,
                    "unit_price": 300.0,
                    "line_total": 1200.0,
                    "created_at": datetime.now().isoformat(),
                },
                {
                    "id": "item-2",
                    "order_id": "ord-2",
                    "product_id": "prod-2",
                    "product_name": "Espresso Roast Beans",
                    "quantity": 2,
                    "unit_price": 425.0,
                    "line_total": 850.0,
                    "created_at": datetime.now().isoformat(),
                },
            ]),
            "products": pd.DataFrame([
                {"id": "prod-1", "product_name": "Signature Cold Brew", "cost_price": 100.0},
                {"id": "prod-2", "product_name": "Espresso Roast Beans", "cost_price": 200.0},
            ]),
            "customers": pd.DataFrame([
                {"id": "cust-1", "customer_name": "Alice Wonderland"},
                {"id": "cust-2", "customer_name": "Bob Builder"},
            ]),
            "payments": pd.DataFrame(),
            "offers": pd.DataFrame(),
        }

        bi_json = execute_business_intelligence(
            data=sample_data,
            plan=plan,
            brand_id=brand,
        )
        print("\n--- 2. BI Computed JSON ---")
        pprint.pprint(bi_json)

        print("\n--- 3. AI Sales Analyst Final Answer ---")
        answer = generate_business_answer(
            question=query,
            plan=plan,
            bi_json=bi_json,
        )
        print(answer)

