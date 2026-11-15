# OrderBook 

A point-of-sale and order tracker for one business on one machine. Take an order at the counter,
move it through the kitchen, collect payment, and ask questions of your own sales data — no
accounts, no cloud, no database server. Every number on screen is computed by pandas from CSV files
that sit next to the code.

Built for a single café, cloud kitchen or shop that wants its own POS and analytics without a
subscription. It is deliberately not multi-tenant, not cloud-synced, and not an accounting system.

## Features

**Counter and orders**
- **POS screen** — tap product tiles to build an order: live name search and category filter,
  per-line quantity steppers, order-level discount %, channel (counter / online / phone), payment
  method, "paid in full" or a partial amount received, an optional note, and an inline
  add-customer form for walk-ins. The confirmation recap links straight to the order.
- **Order lifecycle** — `open → confirmed → preparing → ready → delivered`, one "Mark …" button per
  step plus cancel, shown on the order page with an animated stepper.
- **Payments** — partial payments are first-class: recorded method, balance surfaced in the list,
  on the order, and as receivables in the KPIs, with a delivered-but-still-owed warning.
- **Order list** — debounced search on order number or customer name, a status filter, and a live
  in-view summary (`N orders · ₹X unpaid in this view`).

**Catalogue and customers**
- **Products** — price, cost and margin per row; SKU uniqueness enforced server-side; deleting
  deactivates instead, so past orders keep their line items and history stays readable.
- **Customers** — search, add, and a master/detail view of lifetime orders, revenue, last order and
  full order history.

**Numbers and analytics**
- **Dashboard** — today's revenue, average order, gross profit and outstanding receivables, the
  open pipeline, a 14-day trend, and a card listing anything priced at or below cost.
- **Insights** — 8 KPI cards with previous-period deltas, revenue by day, top products, revenue by
  category, weekday pattern, lowest-margin items at real volume, pipeline, payment mix and best
  customers, over a 7 / 30 / 90-day window.

**AI**
- **Insights summary** — two sections of plain English over the figures already on screen.
- **Intelligence chat** — ask questions in ordinary language, answered from the same computed facts.
- **Analyst agent** — the full three-stage pipeline (plan → pandas BI → narration) is live at
  `POST /api/intelligence/agent`. It is API-only today; no screen in the UI calls it yet.
- The model never queries the store and never supplies a number, so a bad AI reply can only be bad
  prose. Every AI endpoint fails loudly with a 503 while the KPIs stay on screen, and the app is
  fully usable with no API key at all.

**Interface**
- Warm espresso design system on Tailwind v4 tokens, with motion details — pointer glow, card tilt,
  meteors, number tickers, animated charts — that all degrade to correct static values under
  reduced motion.
- Touch-first: 44px targets on coarse pointers, a bottom tab bar under `lg`, and wide tables that
  scroll inside their own pane instead of wrapping.

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite 7, React 19, react-router 7, Tailwind CSS v4, `motion`, lucide icons — no component kit |
| API | FastAPI + uvicorn, pydantic validation on every write |
| Storage | One CSV file per table in `data/`, through a small in-house engine — no SQL, no ORM |
| Analytics | pandas + numpy over the CSV rows |
| AI | LangChain `ChatNVIDIA` (NVIDIA NIM); OpenAI and Ollama clients sit commented alongside |
| Tests | pytest — 37 tests, model mocked, no network |

Needs Python 3.10+ (the code uses `X | None` at runtime) and Node 20.19+ or 22.12+, which is Vite 7's
own floor.

## Run

Two processes, from the project root:

```bash
# 0. deps (first run only)
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
(cd app && npm install)

# 1. API on :8000 — from the project root
.venv/bin/python -m uvicorn backend.main:app --port 8000 --reload

# 2. UI on :5174 — in a second terminal
cd app && npm run dev
```

Open http://localhost:5174. Vite proxies `/api` to `http://127.0.0.1:8000` on a `strictPort`, so
there is no CORS setup and the UI never silently moves to another port. Interactive API docs:
http://localhost:8000/docs.

First run only — 90 days of deterministic demo history (`random.seed(7)`) so Insights has real numbers:

```bash
.venv/bin/python -m backend.seed          # fills empty CSV tables
.venv/bin/python -m backend.seed --force  # regenerates from scratch
```

All data lives in `data/` at the project root — one CSV per table
(`settings.csv`, `products.csv`, `customers.csv`, `orders.csv`, `order_items.csv`).
Delete the folder to start over; the API recreates empty tables on boot.

## Architecture

```
browser 
   │ 
   ▼
backend/main.py            thin routes, pydantic request models, status codes
   ▼
backend/services/*         the actual rules: what a write does, what a number means
   ▼
backend/db.py              CSV engine — read whole table, mutate in memory, atomic replace
data/*.csv                 the entire state of the app
```


