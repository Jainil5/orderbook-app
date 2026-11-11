# Intelligence Page (AI Sales Analyst) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Intelligence page where a local-Ollama sales analyst answers questions about real OrderBook sales data with text + inline charts, all computed server-side.

**Architecture:** FastAPI router + analyst service build FACTS and a chart catalog from the existing `analytics.snapshot()`; the LLM returns strict JSON `{answer, charts:[keys]}`; the backend validates keys and attaches real data. React page is a thin shell rendering API JSON with existing `Bars`/`Trend` components.

**Tech Stack:** Python 3.11 / FastAPI / langchain-ollama / SQLite; React (Vite) / react-router; pytest + httpx for tests.

**Spec:** `docs/superpowers/specs/2026-11-08-intelligence-page-design.md`

## Global Constraints

- Workspace is NOT a git repository — **skip all commit steps**; task completion = tests pass.
- Run all Python commands from project root `/Users/jainil/Documents/development/orderbook-app` (imports are `backend.*`).
- LLM config comes only from env: `OLLAMA_MODEL` (default `gpt-oss:20b-cloud`), `OLLAMA_URL` (default `http://localhost:11434`), `OLLAMA_THINKING` (default false) — import these from `backend.services.ai`, do not redefine.
- The LLM must never emit chart numbers; it selects chart keys only. Unknown keys are dropped.
- No new frontend dependencies. No client-side analytics.
- No scratch files in the repo; verification scripts go in /tmp and get deleted.
- Frontend touch targets ≥44px; verify at ~375px width.
- Ollama IS running locally with `gpt-oss:20b-cloud` available (verified 2026-11-08) — live verification is possible.
- Ports: backend 8000, Vite dev 5173 (check they're free before starting; user may run his own servers — never kill processes you didn't start).

---

### Task 1: Test setup + analyst chart catalog

**Files:**
- Modify: `backend/requirements.txt` (append `pytest`, `httpx`)
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_analyst.py`
- Create: `backend/services/analyst.py`

**Interfaces:**
- Consumes: `analytics.snapshot(days, date_from, date_to) -> dict` (keys: `range, totals, previous, change, daily, top_products, categories, weekday, payments, top_customers, ...`); `ai._facts(snapshot, money) -> str`; `ai.AiUnavailable`; `ai.MODEL/OLLAMA_URL/THINKING`.
- Produces: `analyst.chart_catalog(snapshot: dict) -> dict[str, dict]` where each value is `{"key": str, "title": str, "type": "line"|"bar", "unit": "currency", "data": list}`. Line data items: `{"day": str, "revenue": float}`. Bar data items: `{"label": str, "value": float}`. Keys: `daily_revenue, top_products, categories, weekday, payments, top_customers`. Also `analyst.SUGGESTIONS: list[str]`.

- [ ] **Step 1: Install test deps**

Append to `backend/requirements.txt`:
```
pytest
httpx
```
Run: `python3 -m pip install pytest httpx`

- [ ] **Step 2: Write conftest with a snapshot fixture**

`backend/tests/__init__.py`: empty file.

`backend/tests/conftest.py`:
```python
import pytest

from backend.services import analytics


@pytest.fixture
def snapshot():
    return analytics.snapshot(days=3650)
```
(Uses the real seeded SQLite DB; 3650-day window guarantees seeded orders are included regardless of seed dates.)

- [ ] **Step 3: Write failing tests for the catalog**

`backend/tests/test_analyst.py`:
```python
from backend.services import analyst

MONEY = lambda v: f"₹{v:,.2f}"


def test_catalog_keys(snapshot):
    cat = analyst.chart_catalog(snapshot, MONEY)
    assert set(cat) == {"daily_revenue", "top_products", "categories",
                        "weekday", "payments", "top_customers"}


def test_catalog_shapes(snapshot):
    cat = analyst.chart_catalog(snapshot, MONEY)
    line = cat["daily_revenue"]
    assert line["type"] == "line" and line["unit"] == "currency"
    if line["data"]:
        assert set(line["data"][0]) == {"day", "revenue"}
    for key in ("top_products", "categories", "weekday", "payments", "top_customers"):
        bar = cat[key]
        assert bar["type"] == "bar" and bar["title"]
        for row in bar["data"]:
            assert set(row) == {"label", "value"}


def test_catalog_matches_snapshot(snapshot):
    cat = analyst.chart_catalog(snapshot, MONEY)
    assert [r["value"] for r in cat["top_products"]["data"]] == \
           [r["revenue"] for r in snapshot["top_products"]]
    assert cat["daily_revenue"]["data"] == snapshot["daily"]


def test_suggestions_nonempty():
    assert len(analyst.SUGGESTIONS) >= 4
    assert all(isinstance(s, str) and s for s in analyst.SUGGESTIONS)
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `python3 -m pytest backend/tests/test_analyst.py -v`
Expected: FAIL/ERROR — `analyst` has no attribute `chart_catalog` (module exists but empty) or ImportError.

- [ ] **Step 5: Implement catalog + suggestions**

`backend/services/analyst.py`:
```python
"""Conversational sales analyst. The LLM narrates SQL-computed facts and may
only SELECT precomputed chart keys — it never emits chart numbers itself.
Concept ported from github.com/Jainil5/ai-sales-analyst, rewired to OrderBook
data and local Ollama."""
import json
import re
from datetime import datetime

from langchain_ollama import ChatOllama

from backend.services import ai, analytics

SUGGESTIONS = [
    "How did sales perform this month compared to last?",
    "Which products earn the most revenue?",
    "What does the daily revenue trend look like?",
    "Which weekdays are busiest?",
    "Who are my top customers?",
    "How are customers paying?",
]


def chart_catalog(snapshot: dict, money) -> dict:
    bars = {
        "top_products": ("Top products by revenue",
                         [(r["product"], r["revenue"]) for r in snapshot["top_products"]]),
        "categories": ("Revenue by category",
                       [(r["category"], r["revenue"]) for r in snapshot["categories"]]),
        "weekday": ("Revenue by weekday",
                    [(r["day"], r["revenue"]) for r in snapshot["weekday"]]),
        "payments": ("Collections by payment method",
                    [(r["payment_method"], r["collected"]) for r in snapshot["payments"]]),
        "top_customers": ("Top customers by revenue",
                          [(r["customer"], r["revenue"]) for r in snapshot["top_customers"]]),
    }
    cat = {
        "daily_revenue": {"key": "daily_revenue", "title": "Daily revenue",
                          "type": "line", "unit": "currency", "data": snapshot["daily"]},
    }
    for key, (title, pairs) in bars.items():
        cat[key] = {"key": key, "title": title, "type": "bar", "unit": "currency",
                    "data": [{"label": label, "value": round(float(v), 2)} for label, v in pairs]}
    return cat
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python3 -m pytest backend/tests/test_analyst.py -v`
Expected: 4 PASS. If the DB is empty (no seeded orders), run `python3 -m backend.seed` first, then re-run.

---

### Task 2: Analyst answer pipeline (LLM call, JSON parse, key validation)

**Files:**
- Modify: `backend/services/analyst.py`
- Modify: `backend/tests/test_analyst.py`

**Interfaces:**
- Consumes: Task 1 `chart_catalog`, `SUGGESTIONS`; `ai._facts`, `ai.AiUnavailable`, `ai.MODEL`, `ai.OLLAMA_URL`, `ai.THINKING`, `ai._SYMBOLS`.
- Produces: `analyst.answer(message: str, history: list[dict], currency: str = "INR", days: int = 30) -> dict` returning `{"answer": str, "charts": list[chart dict], "model": str, "generated_at": str}`. `history` items: `{"role": "user"|"assistant", "content": str}`. Raises `ai.AiUnavailable` on any LLM/parse failure. Also `analyst._parse_reply(text: str, catalog: dict) -> dict` returning `{"answer": str, "charts": list}` (pure function, unit-testable).

- [ ] **Step 1: Write failing tests for parsing and answer()**

Append to `backend/tests/test_analyst.py`:
```python
import json
from unittest.mock import patch

import pytest

from backend.services import ai


def _catalog():
    return {"daily_revenue": {"key": "daily_revenue", "title": "Daily revenue",
                              "type": "line", "unit": "currency", "data": []},
            "top_products": {"key": "top_products", "title": "Top products",
                             "type": "bar", "unit": "currency", "data": []}}


def test_parse_plain_json():
    out = analyst._parse_reply('{"answer": "Up 10%.", "charts": ["daily_revenue"]}', _catalog())
    assert out["answer"] == "Up 10%."
    assert [c["key"] for c in out["charts"]] == ["daily_revenue"]


def test_parse_code_fenced_json():
    text = '```json\n{"answer": "Hi", "charts": []}\n```'
    assert analyst._parse_reply(text, _catalog())["answer"] == "Hi"


def test_parse_drops_unknown_keys_and_caps_at_two():
    text = json.dumps({"answer": "x", "charts": ["bogus", "daily_revenue", "top_products", "weekday"]})
    out = analyst._parse_reply(text, _catalog())
    assert [c["key"] for c in out["charts"]] == ["daily_revenue", "top_products"]


def test_parse_garbage_raises():
    with pytest.raises(ai.AiUnavailable):
        analyst._parse_reply("I cannot answer that.", _catalog())


def test_parse_empty_answer_raises():
    with pytest.raises(ai.AiUnavailable):
        analyst._parse_reply('{"answer": "  ", "charts": []}', _catalog())


def test_answer_happy_path(snapshot):
    reply = json.dumps({"answer": "Revenue is steady.", "charts": ["top_products"]})
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = reply
        result = analyst.answer("How are sales?", [])
    assert result["answer"] == "Revenue is steady."
    assert result["charts"][0]["key"] == "top_products"
    assert result["model"] == ai.MODEL
    assert result["generated_at"]


def test_answer_llm_failure_raises():
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.side_effect = RuntimeError("connection refused")
        with pytest.raises(ai.AiUnavailable):
            analyst.answer("How are sales?", [])


def test_answer_history_capped(snapshot):
    reply = json.dumps({"answer": "ok", "charts": []})
    history = [{"role": "user", "content": f"q{i}"} for i in range(20)]
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = reply
        analyst.answer("latest?", history)
        prompt = Mock.return_value.invoke.call_args[0][0]
    assert "q0" not in prompt and "q19" in prompt
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest backend/tests/test_analyst.py -v`
Expected: new tests FAIL — `_parse_reply`/`answer` missing.

- [ ] **Step 3: Implement parse + answer**

Append to `backend/services/analyst.py`:
```python
PREAMBLE = """You are the sales analyst for a small retail/food business using a local POS.
Answer the owner's question in plain English, short and direct.

Hard rules:
- Use ONLY figures in the FACTS block. Never invent, estimate, or guess a number.
- Never state a cause that is not in the facts.
- Quote money with the given currency symbol, exactly as given.
- If the facts cannot answer the question, say so plainly.

You may attach 0 to 2 charts that illustrate your answer. Choose ONLY from these
chart keys (do not invent keys, do not output chart data):
{menu}

Respond with STRICT JSON only, no markdown, exactly this shape:
{{"answer": "<your answer>", "charts": ["<key>", ...]}}"""


def _parse_reply(text: str, catalog: dict) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        data = json.loads(cleaned)
        answer = str(data["answer"]).strip()
        keys = data.get("charts", [])
        if not isinstance(keys, list):
            keys = []
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise ai.AiUnavailable(f"model reply was not valid JSON: {exc}") from exc
    if not answer:
        raise ai.AiUnavailable("model returned an empty answer")
    charts = [catalog[k] for k in keys if isinstance(k, str) and k in catalog][:2]
    return {"answer": answer, "charts": charts}


def answer(message: str, history: list[dict], currency: str = "INR", days: int = 30) -> dict:
    snapshot = analytics.snapshot(days=days)
    symbol = ai._SYMBOLS.get(currency, currency + " ")
    money = lambda v: f"{symbol}{round(float(v), 2):,}"
    catalog = chart_catalog(snapshot)
    menu = "\n".join(f"- {k}: {c['title']}" for k, c in catalog.items())
    turns = "\n".join(f"{t['role']}: {t['content']}" for t in history[-10:])
    prompt = (PREAMBLE.format(menu=menu)
              + f"\n\nFACTS\n{ai._facts(snapshot, money)}"
              + (f"\n\nConversation so far:\n{turns}" if turns else "")
              + f"\n\nOwner's question: {message}\nRespond with JSON now.")
    try:
        llm = ChatOllama(model=ai.MODEL, base_url=ai.OLLAMA_URL, temperature=0.2,
                         reasoning=ai.THINKING, num_ctx=4096)
        result = llm.invoke(prompt)
    except Exception as exc:
        raise ai.AiUnavailable(str(exc)) from exc
    parsed = _parse_reply(result.content or "", catalog)
    return {**parsed, "model": ai.MODEL,
            "generated_at": datetime.now().isoformat(timespec="seconds")}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest backend/tests/test_analyst.py -v`
Expected: all PASS (12 tests).

---

### Task 3: Intelligence router + registration

**Files:**
- Create: `backend/routers/intelligence.py`
- Modify: `backend/main.py` (import + `app.include_router(intelligence.router)` after line 20)
- Create: `backend/tests/test_intelligence_api.py`

**Interfaces:**
- Consumes: `analyst.answer(message, history, currency, days)`, `analyst.SUGGESTIONS`, `ai.AiUnavailable`, `ai.MODEL`, `db.one`.
- Produces: `GET /api/intelligence/suggestions` → `{"suggestions": list[str], "model": str}`; `POST /api/intelligence/chat` body `{"message": str, "history": [{"role","content"}], "days": int}` → `{"answer", "charts", "model", "generated_at"}`; 503 on AiUnavailable; 422 on empty message.

- [ ] **Step 1: Write failing endpoint tests**

`backend/tests/test_intelligence_api.py`:
```python
import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import ai, analyst

client = TestClient(app)


def test_suggestions():
    res = client.get("/api/intelligence/suggestions")
    assert res.status_code == 200
    body = res.json()
    assert body["suggestions"] == analyst.SUGGESTIONS
    assert body["model"] == ai.MODEL


def test_chat_happy_path():
    reply = json.dumps({"answer": "Doing well.", "charts": ["daily_revenue"]})
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = reply
        res = client.post("/api/intelligence/chat", json={"message": "How are sales?"})
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "Doing well."
    assert body["charts"][0]["key"] == "daily_revenue"
    assert "data" in body["charts"][0]


def test_chat_empty_message_422():
    res = client.post("/api/intelligence/chat", json={"message": "  "})
    assert res.status_code == 422


def test_chat_ai_down_503():
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.side_effect = RuntimeError("down")
        res = client.post("/api/intelligence/chat", json={"message": "How are sales?"})
    assert res.status_code == 503
    assert "AI unavailable" in res.json()["detail"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest backend/tests/test_intelligence_api.py -v`
Expected: FAIL — 404 (router not registered).

- [ ] **Step 3: Implement router**

`backend/routers/intelligence.py`:
```python
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend import db
from backend.services import ai, analyst

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatTurn] = []
    days: int = Field(default=30, ge=1, le=3650)

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message must not be blank")
        return v.strip()


class Chart(BaseModel):
    key: str
    title: str
    type: Literal["line", "bar"]
    unit: str
    data: list[dict]


class ChatResponse(BaseModel):
    answer: str
    charts: list[Chart]
    model: str
    generated_at: str


@router.get("/suggestions")
def suggestions() -> dict:
    return {"suggestions": analyst.SUGGESTIONS, "model": ai.MODEL}


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> dict:
    currency = db.one("SELECT currency FROM settings WHERE id = 1")["currency"]
    history = [t.model_dump() for t in req.history[-10:]]
    try:
        return analyst.answer(req.message, history, currency, req.days)
    except ai.AiUnavailable as exc:
        raise HTTPException(503, f"AI unavailable ({ai.MODEL}): {exc}")
```

In `backend/main.py`, change the import line to:
```python
from backend.routers import customers, insights, intelligence, orders, products
```
and add after `app.include_router(insights.router)`:
```python
app.include_router(intelligence.router)
```

- [ ] **Step 4: Run all backend tests**

Run: `python3 -m pytest backend/tests -v`
Expected: all PASS (16 tests).

---

### Task 4: Intelligence frontend page

**Files:**
- Create: `app/src/pages/Intelligence.jsx`
- Modify: `app/src/App.jsx` (import, LINKS entry `{ to: '/intelligence', label: 'Intelligence' }` after Insights, Route)
- Modify: `app/src/styles.css` (append chat styles)

**Interfaces:**
- Consumes: `api.get/post` from `../api.js`; `money` formatter; `Bars` (`rows=[{label,value}]`, `label`, `format` props); `Trend` (`data=[{day,revenue}]`). Endpoints from Task 3.
- Produces: route `/intelligence` rendering the chat; no exports consumed elsewhere.

- [ ] **Step 1: Create the page**

`app/src/pages/Intelligence.jsx`:
```jsx
import { useEffect, useRef, useState } from 'react';
import { api, money } from '../api.js';
import Bars from '../components/Bars.jsx';
import Trend from '../components/Trend.jsx';

function Chart({ chart }) {
  return (
    <div className="chat-chart">
      {chart.type === 'line'
        ? <Trend data={chart.data} height={120} />
        : <Bars rows={chart.data} format={chart.unit === 'currency' ? money : undefined} />}
    </div>
  );
}

export default function Intelligence() {
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/intelligence/suggestions')
      .then((d) => setSuggestions(d.suggestions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setError(null);
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setBusy(true);
    try {
      const res = await api.post('/intelligence/chat', { message: question, history });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, charts: res.charts }]);
    } catch (exc) {
      setError(exc.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-page">
      <header className="page-head">
        <h1>Intelligence</h1>
        <p className="stat-label">Ask about your sales — answers come from your live order data.</p>
      </header>

      <div className="chat-thread">
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p>Try asking:</p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">
              <div className="chat-text">{m.content}</div>
              {m.charts?.map((c) => <Chart key={c.key} chart={c} />)}
            </div>
          </div>
        ))}
        {busy && <div className="chat-msg assistant"><div className="chat-bubble chat-thinking">Analyzing your sales…</div></div>}
        {error && (
          <div className="error chat-error">
            {error}
            <button className="chip" onClick={() => send(messages.at(-1)?.content ?? '')}>Retry</button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, products, customers…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire route + nav in App.jsx**

Add import `import Intelligence from './pages/Intelligence.jsx';`, add `{ to: '/intelligence', label: 'Intelligence' }` to LINKS after the Insights entry, and add `<Route path="/intelligence" element={<Intelligence />} />` before the catch-all route.

- [ ] **Step 3: Append chat styles to styles.css**

```css
/* Intelligence chat */
.chat-page { display: flex; flex-direction: column; height: calc(100vh - 48px); }
.chat-thread { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
.chat-empty { margin: auto; text-align: center; color: var(--muted); }
.chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
.chip { border: 1px solid var(--border, #d8d8d8); background: transparent; border-radius: 999px;
  padding: 10px 16px; min-height: 44px; cursor: pointer; font: inherit; }
.chip:hover { border-color: currentColor; }
.chat-msg { display: flex; }
.chat-msg.user { justify-content: flex-end; }
.chat-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; white-space: pre-wrap; }
.chat-msg.user .chat-bubble { background: var(--accent, #2563eb); color: #fff; }
.chat-msg.assistant .chat-bubble { background: var(--card, #f4f4f5); }
.chat-chart { margin-top: 12px; min-width: 260px; }
.chat-thinking { color: var(--muted); font-style: italic; }
.chat-error { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.chat-input { display: flex; gap: 8px; padding-top: 12px; }
.chat-input input { flex: 1; min-height: 44px; padding: 10px 14px; font: inherit;
  border: 1px solid var(--border, #d8d8d8); border-radius: 8px; }
.chat-input button { min-height: 44px; min-width: 72px; padding: 10px 18px; font: inherit;
  border-radius: 8px; border: none; background: var(--accent, #2563eb); color: #fff; cursor: pointer; }
.chat-input button:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) {
  .chat-page { height: calc(100vh - 120px); }
  .chat-bubble { max-width: 95%; }
  .chat-chart { min-width: 0; }
}
```
Note: check `styles.css` for the actual CSS variable names (`--muted`, `--accent`, `--card`, `--border`) and reuse the real ones where they exist; fallbacks above keep it safe either way. Also check `.page-head` exists; if the app uses a different header pattern (see `Insights.jsx`), match that instead.

- [ ] **Step 4: Verify in browser (golden path + 375px)**

Check ports first: `lsof -i :8000 -i :5173`. Start only if free:
- Backend: `python3 -m uvicorn backend.main:app --port 8000` (background, from project root)
- Frontend: `npm run dev` in `app/` (background)

Use the isolated Playwright MCP browser (never the user's Chrome):
1. Navigate to `http://localhost:5173/intelligence` — suggestion chips appear.
2. Click a suggestion → user bubble, thinking indicator, then answer + chart render.
3. Type a follow-up ("Which products sell least?") → second answer uses history.
4. Resize to 375×812 → layout intact, chips/input ≥44px, charts readable.
5. Console: no errors.

If Ollama misbehaves, verify the 503 error banner + Retry instead, and report it.

---

### Task 5: Polish — .env.example, README, cleanup

**Files:**
- Create: `.env.example` (project root)
- Modify: `README.md` (append Intelligence section)

**Interfaces:**
- Consumes: everything above; no code interfaces.
- Produces: docs only.

- [ ] **Step 1: Write .env.example**

```
# Local Ollama configuration for AI features (Insights summary + Intelligence chat)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:20b-cloud
# gpt-oss reasoning models must keep thinking off or answers come back empty
OLLAMA_THINKING=false
```

- [ ] **Step 2: Append README section**

```markdown
## Intelligence — AI Sales Analyst

Conversational analyst over your live sales data, powered by a local Ollama model.
Concept ported from [Jainil5/ai-sales-analyst](https://github.com/Jainil5/ai-sales-analyst),
rewired from its sample dataset to OrderBook's SQLite analytics.

- All intelligence is server-side: `backend/services/analyst.py` builds facts and
  chart datasets from SQL; the LLM only narrates and picks chart keys — it can
  never fabricate chart numbers.
- API: `POST /api/intelligence/chat`, `GET /api/intelligence/suggestions`.
  Interactive API docs at `http://localhost:8000/docs`.
- Charts render inline in the chat and are ephemeral — nothing is written to disk.

Setup: copy `.env.example` values into your environment, run Ollama with the
configured model, then start backend + frontend as usual. Tests:
`python3 -m pytest backend/tests`.
```
Match the README's existing heading style; read it first.

- [ ] **Step 3: Final verification + cleanup**

1. `python3 -m pytest backend/tests -v` → all pass.
2. One live chat round-trip in the browser (Task 4 servers still up).
3. Stop ONLY the servers this session started (Task 4); never touch user-run processes.
4. Delete any /tmp scratch files created during verification.
```