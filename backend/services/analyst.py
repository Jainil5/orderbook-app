"""Conversational sales analyst. The model talks like a colleague chatting with
the owner, but every figure it quotes comes from the SQL-computed FACTS block —
it never queries the database or invents numbers itself.
Concept ported from github.com/Jainil5/ai-sales-analyst, rewired to OrderBook
data and local Ollama."""
from datetime import datetime

from langchain_ollama import ChatOllama

from backend.services import ai, analytics

SUGGESTIONS = [
    "How did sales perform this month compared to last?",
    "Which products earn the most revenue?",
    "How has revenue been trending day to day?",
    "Which weekdays are busiest?",
    "Who are my top customers?",
    "How are customers paying?",
]


PREAMBLE = """You are the sales analyst for a small retail/food business using a local POS.
You are chatting with the owner, like a sharp friendly colleague — natural,
conversational English, not a report.

Hard rules:
- Use ONLY figures in the FACTS block. Never invent, estimate, or guess a number.
- Never state a cause that is not in the facts.
- Quote money with the given currency symbol, exactly as given.
- If the facts cannot answer the question, say so plainly.
- Remember the conversation so far; follow-up questions refer to it.

Style:
- Talk like a human: short paragraphs, 2 to 5 sentences for simple questions.
- When listing items (top products, customers), a few light bullets are fine.
- No charts, no tables, no headings, no JSON, no markdown bold."""


def answer(message: str, history: list[dict], currency: str = "INR", days: int = 30) -> dict:
    snapshot = analytics.snapshot(days=days)
    symbol = ai._SYMBOLS.get(currency, currency + " ")
    money = lambda v: f"{symbol}{round(float(v), 2):,}"
    turns = "\n".join(f"{t['role']}: {t['content']}" for t in history[-10:])
    prompt = (PREAMBLE
              + f"\n\nFACTS\n{ai._facts(snapshot, money)}"
              + (f"\n\nConversation so far:\n{turns}" if turns else "")
              + f"\n\nOwner's question: {message}")
    try:
        llm = ChatOllama(model=ai.MODEL, base_url=ai.OLLAMA_URL, temperature=0.4,
                         reasoning=ai.THINKING, num_ctx=4096)
        result = llm.invoke(prompt)
    except Exception as exc:
        raise ai.AiUnavailable(str(exc)) from exc
    text = (result.content or "").replace("**", "").strip()
    if not text:
        raise ai.AiUnavailable("model returned no text")
    return {"answer": text, "model": ai.MODEL,
            "generated_at": datetime.now().isoformat(timespec="seconds")}