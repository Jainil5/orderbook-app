# OrderBook local

Single-brand POS and order tracker that runs entirely on one machine. React frontend, Python API,
SQLite file, and Ollama-backed analytics narration.

## Run

Two processes, from the project root:

```bash
# 1. API on :8000
python3 -m uvicorn backend.main:app --port 8000 --reload

# 2. UI on :5174
cd app && npm install && npm run dev
```

Open http://localhost:5174. Vite proxies `/api` to the backend, so there is no CORS setup.

First run only — 90 days of demo history so Insights has real numbers:

```bash
python3 -m backend.seed          # fills an empty database
python3 -m backend.seed --force  # regenerates from scratch
```

The database is `orderbook.db` at the project root. Delete it to start over.

## Layout

```
app/        Vite + React SPA (react-router, no Next.js, no UI kit)
backend/
  main.py           FastAPI app, creates the schema on boot
  db.py             sqlite3 helpers, one transaction context manager
  schema.sql        the tables — edit this, there is no migration tool
  seed.py           deterministic demo data
  routers/          products, customers, orders, insights, intelligence
  services/
    analytics.py    every number, computed in SQL
    ai.py           LangChain + Ollama narration over those numbers
    analyst.py      conversational sales analyst (Intelligence page)
  tests/            pytest suite (LLM mocked)
```

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET/POST /api/products`, `PUT/DELETE /api/products/{id}` | catalogue; DELETE deactivates so history stays readable |
| `GET/POST /api/customers`, `GET /api/customers/{id}` | customer list with lifetime stats, plus their orders |
| `GET/POST /api/orders`, `GET /api/orders/{id}`, `PATCH /api/orders/{id}` | order capture, tracking, payments |
| `GET /api/insights?days=30` | full analytics snapshot |
| `POST /api/insights/summary?days=30` | AI prose over that snapshot |
| `GET /api/intelligence/suggestions` | starter questions for the analyst chat |
| `POST /api/intelligence/chat` | conversational answer grounded in live sales data |
| `GET /api/dashboard` | today's numbers, open pipeline, pricing warnings |
| `GET /api/settings` | tax rate, statuses, channels, payment methods |

Order totals are always recomputed from the `products` table on submit — prices sent by the client are
ignored. Statuses: `open → confirmed → preparing → ready → delivered`, or `cancelled`.

## AI

`services/ai.py` passes the computed figures to Ollama and asks for two sections: Performance and
Margins and mix — a summary of the current data only, never recommendations or next steps. The model
never queries the database and never produces a figure of its own,
so a bad AI response can only be bad prose — the numbers on screen stay correct. If Ollama is down the
endpoint returns 503 and the UI says so while still showing every KPI.

Configure with environment variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `OLLAMA_MODEL` | `gpt-oss:20b-cloud` | any Ollama chat model; `gemma4:e4b-mlx` keeps it fully offline |
| `OLLAMA_URL` | `http://localhost:11434` | |
| `OLLAMA_THINKING` | `false` | leave off — reasoning models spend the token budget thinking |

`gpt-oss:20b-cloud` needs network and an Ollama account (and, as of late 2026, cloud credits).
The `.env` here points `OLLAMA_MODEL` at `gemma4:e4b-mlx`, a fully local model, so the chat works
offline. Everything else in the app works offline regardless.

## Intelligence — AI sales analyst

The `/intelligence` page is a chat over your live sales data. Concept ported from
[Jainil5/ai-sales-analyst](https://github.com/Jainil5/ai-sales-analyst), rewired from its sample
dataset to this app's SQLite analytics.

All intelligence is server-side: `services/analyst.py` builds the facts from SQL and the model
only narrates them as plain conversational prose — it can never fabricate a number, and it emits
no charts, tables, or JSON. Conversation history lives only in browser memory; nothing is written
to disk. Interactive API docs: http://localhost:8000/docs.

Tests: `python3 -m pytest backend/tests` (Ollama is mocked; no model needed).

## Notes

- `tax_percent` and `business_name` live in the `settings` row; change them with
  `sqlite3 orderbook.db "UPDATE settings SET business_name='Cafe Name', tax_percent=5 WHERE id=1"`.
- No auth and no multi-brand scoping — this is a local single-business tool. The hosted
  [orderbook](https://github.com/Jainil5/orderbook) app keeps Supabase + RLS for that.
- Python deps: `pip install -r backend/requirements.txt` (FastAPI, uvicorn, langchain-ollama).
