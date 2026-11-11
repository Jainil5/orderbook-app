# Intelligence Page — AI Sales Analyst

Date: 2026-11-08
Status: Approved (design approved in chat; backend-heavy split confirmed)

## Purpose

Add an "Intelligence" page to OrderBook: a conversational AI sales analyst that
answers questions about the business's real sales data with text plus inline
charts. Ported concept from github.com/Jainil5/ai-sales-analyst (conversational
Q&A over computed sales metrics), rewired from its Nike CSV / spaCy rule-matcher
to OrderBook's SQLite analytics and local Ollama LLM.

This project is a backend/Python/API showcase: the API owns all intelligence;
the frontend is a minimal shell that only renders API JSON.

## Architecture

```
Intelligence.jsx ──POST /api/intelligence/chat──▶ intelligence router
                                                      │
                                        analyst.py: facts + chart menu
                                        from analytics.snapshot() (SQL)
                                                      │
                                               Ollama (local LLM)
                                                      │
                                        {answer, charts: [keys]}
                                                      │
                              router attaches real data for valid keys
```

Anti-hallucination contract (same philosophy as `services/ai.py`): the LLM never
emits chart numbers. It receives precomputed datasets under named keys and may
only select keys. The backend validates keys and attaches the SQL-computed data.
The LLM is instructed to use only figures in the FACTS block.

## Backend

### `backend/services/analyst.py`

- `SUGGESTIONS`: static list of starter questions (served by the API).
- `chart_catalog(snapshot) -> dict[key, chart]`: builds the chart menu
  from the existing snapshot — no new SQL:
  - `daily_revenue` (line): `snapshot["daily"]` → `{day, revenue}` (Trend shape)
  - `top_products` (bar): revenue per product
  - `categories` (bar): revenue per category
  - `weekday` (bar): revenue per weekday
  - `payments` (bar): collected per payment method
  - `top_customers` (bar): revenue per customer
  Bar data is normalized to `{label, value}` (Bars shape).
  Each chart: `{key, title, type: "line"|"bar", data: [...], unit: "currency"|"count"}`.
- `answer(message, history, days=30) -> dict`:
  - Builds FACTS by reusing `ai._facts(snapshot, money)` from `services/ai.py`.
  - Prompt: answer in plain English, only FACTS figures, then select 0–2 chart
    keys that best illustrate the answer. Respond as strict JSON
    `{"answer": "...", "charts": ["key", ...]}`.
  - Calls `ChatOllama` with the same env config as `ai.py` (`OLLAMA_MODEL`,
    `OLLAMA_URL`, `OLLAMA_THINKING`), temperature ~0.2.
  - Parses JSON (tolerate markdown code fences); invalid/unknown keys dropped;
    unparseable output → `AiUnavailable`.
  - Returns `{answer, charts: [full chart objects], model, generated_at}`.
- Reuses `ai.AiUnavailable` for all Ollama/parse failures.

### `backend/routers/intelligence.py`

Pydantic models for the contract (visible in OpenAPI `/docs`):

- `ChatTurn(role: Literal["user","assistant"], content: str)`
- `ChatRequest(message: str, history: list[ChatTurn] = [], days: int = 30)`
  — message non-empty, history capped at last 10 turns server-side.
- `Chart(key, title, type, data: list[dict], unit)`
- `ChatResponse(answer, charts: list[Chart], model, generated_at)`

Endpoints:

- `GET /api/intelligence/suggestions` → `{suggestions: [...], model}`
- `POST /api/intelligence/chat` → `ChatResponse`; `AiUnavailable` → HTTP 503
  with clean detail string (same pattern as `/api/insights/summary`).

Router registered in `backend/main.py`. Currency read from settings table.

## Frontend (minimal, API-driven)

- `app/src/pages/Intelligence.jsx`, route `/intelligence`, nav link in
  `App.jsx` (desktop sidebar + mobile nav).
- On mount: `GET /api/intelligence/suggestions` → starter chips.
- Chat state in React memory only (ephemeral; gone on refresh). Sends last 10
  turns as history. No client-side computation.
- Assistant messages render answer text plus charts from response JSON:
  `type: "line"` → existing `Trend` component; `type: "bar"` → existing `Bars`
  component (currency values formatted with `money`). No new dependencies.
- States: loading indicator while awaiting reply; error banner on 503/network
  failure with retry; empty state with suggestion chips.
- Styling matches existing app (`styles.css`), touch targets ≥44px, verified at
  ~375px width.

## Error handling

- Ollama down / model missing / bad output → 503, UI shows friendly banner;
  rest of the app unaffected.
- Empty message → 422 via Pydantic validation.
- Unknown chart keys from LLM → silently dropped (never fabricate data).

## Testing

- Backend unit tests (pytest, mocked `ChatOllama`): valid JSON parse, code-fence
  tolerance, unknown-key dropping, unparseable → AiUnavailable, Ollama failure
  → AiUnavailable, history cap.
- Endpoint tests via FastAPI TestClient: suggestions, chat happy path (mocked
  service), 503 path, 422 empty message.
- Browser verification (isolated Playwright browser): golden path with Ollama
  running if available; otherwise verify graceful 503 UI. Desktop + 375px.

## Deliverables / polish

- `.env.example` documenting OLLAMA_URL / OLLAMA_MODEL / OLLAMA_THINKING.
- README section: architecture, setup, run instructions, ai-sales-analyst
  lineage note.
- FastAPI OpenAPI docs at `/docs` serve as the API showcase.

## Out of scope

- Persisted chat history, auth/multi-user, cloud LLM providers, new frontend
  chart libraries, changes to existing pages.