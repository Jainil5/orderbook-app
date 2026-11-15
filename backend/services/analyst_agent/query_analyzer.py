"""Turn a business question into a validated analytics plan.

The LLM only classifies intent, domains, metrics, filters and a period type;
Python resolves the real date boundaries, so the model cannot invent a range.
Its output stays untrusted input — the plan selects which metrics to compute and
cannot reach the store on its own.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

try:  # imported as part of the backend package
    from ..model import llm
except ImportError:  # loose script / tests with this folder on sys.path
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from model import llm


# ---------------------------------------------------------------------------
# Allowed vocabulary. Expand these lists as your BI engine grows.
# ---------------------------------------------------------------------------

ALLOWED_DOMAINS = {
    "sales",
    "products",
    "customers",
    "payments",
    "offers",
    "retention",
    "profitability",
    "trends",
    "business",
}

ALLOWED_INTENTS = {
    "business_overview",
    "sales_overview",
    "sales_trend",
    "sales_comparison",
    "product_performance",
    "product_comparison",
    "customer_analysis",
    "customer_retention",
    "customer_favourites",
    "customer_lookup",
    "payment_analysis",
    "offer_analysis",
    "profitability_analysis",
    "business_insights",
    "anomaly_detection",
    "forecasting",
    "general_business_question",
    "unsupported",
}

ALLOWED_METRICS = {
    "revenue",
    "gross_sales",
    "net_sales",
    "orders",
    "average_order_value",
    "amount_collected",
    "daily_revenue",
    "monthly_revenue",
    "revenue_growth",
    "order_growth",
    "units_sold",
    "product_revenue",
    "top_products",
    "low_selling_products",
    "category_performance",
    "product_margin",
    "gross_profit",
    "customer_count",
    "new_customers",
    "returning_customers",
    "repeat_customers",
    "repeat_customer_rate",
    "customer_spending",
    "top_customers",
    "purchase_frequency",
    "customer_favourites",
    "inactive_customers",
    "payment_methods",
    "offer_usage",
    "discount_amount",
    "retention",
    "cohort_retention",
    "sales_anomalies",
    "business_summary",
}

ALLOWED_PERIODS = {
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "last_2_days",
    "last_7_days",
    "last_30_days",
    "this_month",
    "last_month",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "all_time",
    "custom",
}

ALLOWED_COMPARISONS = {
    "none",
    "previous_period",
    "previous_week",
    "previous_month",
    "previous_quarter",
    "previous_year",
    "custom",
}

ALLOWED_GRANULARITIES = {
    "none",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "yearly",
    "product",
    "category",
    "customer",
    "payment_method",
}

SYSTEM_PROMPT = """
You are the query-planning component for OrderBook, a small-business
business-intelligence application.

Your only task is to translate the user's question into a JSON analytics plan.
Do not answer the business question. Do not invent business figures. Do not
write SQL or code. Do not request or return tenant IDs, credentials, or secrets.

Return exactly one JSON object with these keys:
{
  "intent": string,
  "domains": [string],
  "metrics": [string],
  "period": {
    "type": string,
    "start_date": "YYYY-MM-DD or null",
    "end_date": "YYYY-MM-DD or null",
    "source_text": string
  },
  "comparison": {
    "type": string,
    "start_date": "YYYY-MM-DD or null",
    "end_date": "YYYY-MM-DD or null"
  },
  "granularity": string,
  "filters": {
    "product_name": string or null,
    "category": string or null,
    "customer_name": string or null,
    "payment_method": string or null,
    "order_status": string or null
  },
  "requires_full_context": boolean,
  "clarification_required": boolean,
  "clarification_question": string or null,
  "confidence": number,
  "reason": string
}

Allowed intent values:
business_overview, sales_overview, sales_trend, sales_comparison,
product_performance, product_comparison, customer_analysis,
customer_retention, customer_favourites, customer_lookup,
payment_analysis, offer_analysis, profitability_analysis,
business_insights, anomaly_detection, forecasting,
general_business_question, unsupported.

Allowed domains:
sales, products, customers, payments, offers, retention, profitability,
trends, business.

Allowed metrics:
revenue, gross_sales, net_sales, orders, average_order_value,
amount_collected, daily_revenue, monthly_revenue, revenue_growth,
order_growth, units_sold, product_revenue, top_products,
low_selling_products, category_performance, product_margin, gross_profit,
customer_count, new_customers, returning_customers, repeat_customers,
repeat_customer_rate, customer_spending, top_customers, purchase_frequency,
customer_favourites, inactive_customers, payment_methods, offer_usage,
discount_amount, retention, cohort_retention, sales_anomalies,
business_summary.

Allowed period types:
today, yesterday, this_week, last_week, last_2_days, last_7_days, last_30_days,
this_month, last_month, this_quarter, last_quarter, this_year,
last_year, all_time, custom.

Allowed comparison types:
none, previous_period, previous_week, previous_month, previous_quarter,
previous_year, custom.

Allowed granularities:
none, hourly, daily, weekly, monthly, quarterly, yearly, product,
category, customer, payment_method.

Rules:
1. Infer only what the question supports. If no time range is stated, use
   last_30_days unless the question clearly asks for all-time/lifetime data.
2. For "today", "yesterday", "this week", etc., return the corresponding
   period type. Python will resolve exact dates.
3. "This week" means Monday through the current local date. "Last week" means
   the previous Monday through Sunday.
4. "Last 7 days" and "last 30 days" are rolling windows including today.
5. If a comparison is requested without a named comparison period, use
   previous_period. For "compared with last month", use previous_month.
6. A request for a broad overall report, business health, or "how is my
   business doing?" should set requires_full_context=true and include all
   relevant domains.
7. A focused question should request only relevant domains and metrics.
8. Extract named product, category, customer, and payment-method filters
   exactly as stated. Do not invent names.
9. If the question is ambiguous in a way that materially changes the result,
   set clarification_required=true and ask one concise question.
10. Confidence must be between 0 and 1.
11. Return only valid JSON, with no Markdown fences or commentary.
"""


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------

def _call_classifier(
    question: str,
    current_local_date: str,
    timezone: str,
) -> dict:
    user_prompt = f"""
Business timezone: {timezone}
Current local date: {current_local_date}

User question:
{question}

Classify this question into the required JSON analytics plan.
Return only a valid JSON object. Do not wrap it in Markdown fences.
"""

    response = llm.invoke([
        ("system", SYSTEM_PROMPT),
        ("human", user_prompt),
    ])
    content = response.content

    if isinstance(content, list):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )

    content = str(content).strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I).strip()

    if not content:
        raise ValueError("The query analyzer LLM returned an empty response.")

    try:
        result = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Query analyzer returned invalid JSON: {content}") from exc

    if not isinstance(result, dict):
        raise ValueError("Query analyzer response must be a JSON object.")

    return result


# ---------------------------------------------------------------------------
# Date resolution — Python is the source of truth for actual date boundaries.
# Dates are inclusive local calendar dates.
# ---------------------------------------------------------------------------

def _month_start(value: date) -> date:
    return value.replace(day=1)


def _add_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    year, month_zero = divmod(month_index, 12)
    return date(year, month_zero + 1, 1)


def _quarter_start(value: date) -> date:
    month = ((value.month - 1) // 3) * 3 + 1
    return date(value.year, month, 1)


def resolve_period(
    period_type: str,
    current_date: date,
    explicit_start: str | None = None,
    explicit_end: str | None = None,
) -> tuple[date, date]:
    if period_type == "today":
        return current_date, current_date

    if period_type == "yesterday":
        day = current_date - timedelta(days=1)
        return day, day

    if period_type == "this_week":
        start = current_date - timedelta(days=current_date.weekday())
        return start, current_date

    if period_type == "last_week":
        this_monday = current_date - timedelta(days=current_date.weekday())
        return this_monday - timedelta(days=7), this_monday - timedelta(days=1)

    if period_type == "last_2_days":
        return current_date - timedelta(days=1), current_date

    if period_type == "last_7_days":
        return current_date - timedelta(days=6), current_date

    if period_type == "last_30_days":
        return current_date - timedelta(days=29), current_date

    if period_type == "this_month":
        return _month_start(current_date), current_date

    if period_type == "last_month":
        start = _add_months(_month_start(current_date), -1)
        return start, _month_start(current_date) - timedelta(days=1)

    if period_type == "this_quarter":
        return _quarter_start(current_date), current_date

    if period_type == "last_quarter":
        this_start = _quarter_start(current_date)
        previous_start = _add_months(this_start, -3)
        return previous_start, this_start - timedelta(days=1)

    if period_type == "this_year":
        return date(current_date.year, 1, 1), current_date

    if period_type == "last_year":
        return date(current_date.year - 1, 1, 1), date(current_date.year - 1, 12, 31)

    if period_type == "all_time":
        # The caller should interpret this as no lower date bound.
        return date(1970, 1, 1), current_date

    if period_type == "custom":
        if not explicit_start or not explicit_end:
            raise ValueError("Custom period requires start_date and end_date.")
        start = date.fromisoformat(explicit_start)
        end = date.fromisoformat(explicit_end)
        if end < start:
            raise ValueError("period.end_date must be on or after start_date.")
        return start, end

    raise ValueError(f"Unsupported period type: {period_type}")


def resolve_comparison(
    comparison_type: str,
    start: date,
    end: date,
    explicit_start: str | None = None,
    explicit_end: str | None = None,
) -> tuple[date, date] | None:
    if comparison_type == "none":
        return None

    if comparison_type == "custom":
        if not explicit_start or not explicit_end:
            raise ValueError("Custom comparison requires start_date and end_date.")
        comp_start = date.fromisoformat(explicit_start)
        comp_end = date.fromisoformat(explicit_end)
        if comp_end < comp_start:
            raise ValueError("Comparison end_date must be on or after start_date.")
        return comp_start, comp_end

    if comparison_type == "previous_week":
        this_monday = start - timedelta(days=start.weekday())
        return this_monday - timedelta(days=7), this_monday - timedelta(days=1)

    if comparison_type == "previous_month":
        previous_start = _add_months(_month_start(start), -1)
        return previous_start, _month_start(start) - timedelta(days=1)

    if comparison_type == "previous_quarter":
        this_start = _quarter_start(start)
        previous_start = _add_months(this_start, -3)
        return previous_start, this_start - timedelta(days=1)

    if comparison_type == "previous_year":
        def safe_previous_year(d: date) -> date:
            try:
                return d.replace(year=d.year - 1)
            except ValueError:
                return d.replace(year=d.year - 1, day=28)
        return safe_previous_year(start), safe_previous_year(end)

    if comparison_type == "previous_period":
        duration = (end - start).days + 1
        comp_end = start - timedelta(days=1)
        comp_start = comp_end - timedelta(days=duration - 1)
        return comp_start, comp_end

    raise ValueError(f"Unsupported comparison type: {comparison_type}")


# ---------------------------------------------------------------------------
# Validation and normalization
# ---------------------------------------------------------------------------

def _clean_list(value: Any, allowed: set[str]) -> list[str]:
    if not isinstance(value, list):
        return []
    output = []
    for item in value:
        if isinstance(item, str):
            normalized = item.strip().lower()
            if normalized in allowed and normalized not in output:
                output.append(normalized)
    return output


def _clean_filters(value: Any) -> dict:
    allowed_keys = {
        "product_name",
        "category",
        "customer_name",
        "payment_method",
        "order_status",
    }
    result = {key: None for key in allowed_keys}

    if isinstance(value, dict):
        for key in allowed_keys:
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                # Keep extracted names as supplied; they are filter values,
                # not authorization instructions.
                result[key] = item.strip()[:150]
    return result


def _normalize_plan(
    raw: dict,
    question: str,
    timezone: str,
    now: datetime | None = None,
) -> dict:
    local_now = now.astimezone(ZoneInfo(timezone)) if now else datetime.now(ZoneInfo(timezone))
    today = local_now.date()

    intent = raw.get("intent")
    if intent not in ALLOWED_INTENTS:
        intent = "general_business_question"

    domains = _clean_list(raw.get("domains"), ALLOWED_DOMAINS)
    metrics = _clean_list(raw.get("metrics"), ALLOWED_METRICS)

    period_raw = raw.get("period") if isinstance(raw.get("period"), dict) else {}
    period_type = period_raw.get("type", "last_30_days")
    if period_type not in ALLOWED_PERIODS:
        period_type = "last_30_days"

    explicit_start = period_raw.get("start_date")
    explicit_end = period_raw.get("end_date")
    start, end = resolve_period(
        period_type, today, explicit_start, explicit_end
    )

    comparison_raw = (
        raw.get("comparison")
        if isinstance(raw.get("comparison"), dict)
        else {}
    )
    comparison_type = comparison_raw.get("type", "none")
    if comparison_type not in ALLOWED_COMPARISONS:
        comparison_type = "none"

    comparison_dates = resolve_comparison(
        comparison_type,
        start,
        end,
        comparison_raw.get("start_date"),
        comparison_raw.get("end_date"),
    )

    comparison = {
        "type": comparison_type,
        "start_date": comparison_dates[0].isoformat() if comparison_dates else None,
        "end_date": comparison_dates[1].isoformat() if comparison_dates else None,
    }

    granularity = raw.get("granularity", "none")
    if granularity not in ALLOWED_GRANULARITIES:
        granularity = "none"

    # Broad questions default to the complete business context.
    requires_full_context = bool(raw.get("requires_full_context", False))
    if intent == "business_overview":
        requires_full_context = True
    if requires_full_context:
        domains = ["sales", "products", "customers", "payments", "offers", "trends", "profitability"]

    confidence = raw.get("confidence", 0.5)
    try:
        confidence = max(0.0, min(1.0, float(confidence)))
    except (TypeError, ValueError):
        confidence = 0.5

    clarification_required = bool(raw.get("clarification_required", False))
    clarification_question = raw.get("clarification_question")
    if not isinstance(clarification_question, str):
        clarification_question = None

    return {
        "schema_version": "1.0",
        "question": question,
        "normalized_question": (
            raw.get("normalized_question")
            if isinstance(raw.get("normalized_question"), str)
            else question
        ),
        "intent": intent,
        "domains": domains,
        "metrics": metrics,
        "period": {
            "type": period_type,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "source_text": period_raw.get("source_text"),
            "timezone": timezone,
        },
        "comparison": comparison,
        "granularity": granularity,
        "filters": _clean_filters(raw.get("filters")),
        "requires_full_context": requires_full_context,
        "clarification_required": clarification_required,
        "clarification_question": clarification_question,
        "confidence": confidence,
        "reason": (
            raw.get("reason") if isinstance(raw.get("reason"), str) else ""
        ),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_query(
    question: str,
    timezone: str = "Asia/Kolkata",
    now: datetime | None = None,
) -> dict:
    """
    Classify one natural-language business question and return a validated plan.

    `now` is optional and useful for deterministic tests. If supplied, it must
    be timezone-aware.
    """
    if not isinstance(question, str) or not question.strip():
        raise ValueError("question must be a non-empty string.")

    # Validate timezone before making an LLM request.
    ZoneInfo(timezone)

    local_now = now.astimezone(ZoneInfo(timezone)) if now else datetime.now(ZoneInfo(timezone))
    raw = _call_classifier(
        question=question.strip(),
        current_local_date=local_now.date().isoformat(),
        timezone=timezone,
    )

    return _normalize_plan(
        raw=raw,
        question=question.strip(),
        timezone=timezone,
        now=local_now,
    )


def normalize_classifier_output(
    raw: dict,
    question: str,
    timezone: str = "Asia/Kolkata",
    now: datetime | None = None,
) -> dict:
    """
    Validate a classifier JSON object without calling an LLM.
    Useful for tests, alternative LLM providers, and debugging.
    """
    ZoneInfo(timezone)
    return _normalize_plan(raw, question, timezone, now)


if __name__ == "__main__":
    import pprint
    import sys

    question = " ".join(sys.argv[1:]) or "How were my sales last week?"
    pprint.pprint(analyze_query(question))