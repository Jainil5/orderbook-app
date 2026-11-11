"""AI narration over the analytics snapshot. The model receives only numbers
that analytics.py already computed and must not introduce any of its own."""
import os
from datetime import datetime

from dotenv import load_dotenv
from langchain_ollama import ChatOllama

load_dotenv()

MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss:20b-cloud")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
# gpt-oss is a reasoning model: if thinking is left on it spends the whole token
# budget thinking and returns empty content. Narration does not need chain of thought.
THINKING = os.getenv("OLLAMA_THINKING", "false").lower() in ("1", "true", "yes")

PREAMBLE = """You are the analyst for a small retail/food business using a local POS.
Write in plain English for the owner, not for an engineer.

Hard rules:
- Use ONLY the figures in the FACTS block. Never invent, estimate, or guess a number.
- Never state a cause that is not in the facts (no "the weather", "the holidays", "the season").
  You may divide or compare the given figures; anything else you must leave out.
- Quote money with the given currency symbol, exactly as given.
- Plain prose with short bullet points. No tables, no extra headings.
- Summarize the current data only. No recommendations, next steps, action
  plans, or advice — not even suggestions tied to the figures.

Write exactly these two sections and nothing else:
Performance: revenue, order volume, average order value versus the previous period.
Margins and mix: gross margin, discounting, what sells, what underperforms.

Stay under 200 words."""


class AiUnavailable(Exception):
    """Ollama unreachable, model missing, or auth needed — the UI still shows the numbers."""


_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


def _facts(snapshot: dict, money) -> str:
    t, p, c = snapshot["totals"], snapshot["previous"], snapshot["change"]
    lines = [
        f"Period: {snapshot['range']['from']} to {snapshot['range']['to']} "
        f"({snapshot['range']['days']} days), compared with "
        f"{snapshot['range']['prev_from']} to {snapshot['range']['prev_to']}",
        f"Revenue {money(t['revenue'])} (previous {money(p['revenue'])}, change {c['revenue_pct']}%)",
        f"Orders {t['orders']} (previous {p['orders']}, change {c['orders_pct']}%)",
        f"Average order value {money(t['aov'])} (previous {money(p['aov'])}, change {c['aov_pct']}%)",
        f"Units sold {t['units']}, lines per order {t['avg_lines_per_order']}",
        f"Gross profit {money(t['gross_profit'])}, margin {t['margin_pct']}% "
        f"(previous margin {p['margin_pct']}%, change {c['margin_pts']} points)",
        f"Discounts given {money(t['discounts'])}, tax collected {money(t['tax'])}, "
        f"outstanding receivables {money(t['outstanding'])}",
        f"Cancelled orders {t['cancelled']} ({t['cancelled_pct']}% of all orders)",
        "Top products by revenue: " + ", ".join(
            f"{r['product']} ({money(r['revenue'])}, {r['units']} units)" for r in snapshot["top_products"]),
        "Lowest-margin products with real volume: " + (", ".join(
            f"{r['product']} ({r['margin_pct']}% margin on {r['units']} units)"
            for r in snapshot["low_margin_products"]) or "none"),
        "Revenue by category: " + ", ".join(
            f"{r['category']} ({money(r['revenue'])})" for r in snapshot["categories"]),
        "Best day: " + (f"{snapshot['best_day']['day']} at {money(snapshot['best_day']['revenue'])}"
                        if snapshot["best_day"] else "no orders in period"),
        "Worst day: " + (f"{snapshot['worst_day']['day']} at {money(snapshot['worst_day']['revenue'])}"
                         if snapshot["worst_day"] else "no orders in period"),
        "Weekday pattern: " + ", ".join(
            f"{r['day']} ({money(r['revenue'])})" for r in snapshot["weekday"]),
        f"Walk-in orders {snapshot['walkins']['orders']} worth {money(snapshot['walkins']['revenue'])}",
        "Top customers: " + (", ".join(
            f"{r['customer']} ({money(r['revenue'])} over {r['orders']} orders)"
            for r in snapshot["top_customers"]) or "none recorded"),
        "Payment mix: " + ", ".join(
            f"{r['payment_method']} ({money(r['collected'])})" for r in snapshot["payments"]),
        "Open pipeline: " + (", ".join(
            f"{r['status']} {r['orders']}" for r in snapshot["statuses"]) or "none"),
    ]
    return "\n".join(lines)


def narrate(snapshot: dict, currency: str = "INR") -> dict:
    symbol = _SYMBOLS.get(currency, currency + " ")
    money = lambda v: f"{symbol}{round(float(v), 2):,}"
    prompt = f"{PREAMBLE}\n\nFACTS\n{_facts(snapshot, money)}\n\nWrite the three sections now."
    try:
        # No num_predict cap: gpt-oss still emits thinking, and a cap that fits the
        # thinking leaves no room for the answer, so content comes back empty.
        llm = ChatOllama(model=MODEL, base_url=OLLAMA_URL, temperature=0.2,
                         reasoning=THINKING, num_ctx=4096)
        result = llm.invoke(prompt)
    except Exception as exc:  # any Ollama/HTTP/auth failure
        raise AiUnavailable(str(exc)) from exc

    text = (result.content or "").replace("**", "").strip()
    if not text:
        raise AiUnavailable("model returned no text")
    return {"summary": text, "model": MODEL,
            "generated_at": datetime.now().isoformat(timespec="seconds")}
