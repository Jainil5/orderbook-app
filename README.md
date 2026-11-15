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
browser (React SPA on :5174)
   │  /api/… proxied by Vite — no CORS setup, no base URL to configure
   ▼
backend/main.py            thin routes, pydantic request models, status codes
   ▼
backend/services/*         the actual rules: what a write does, what a number means
   ▼
backend/db.py              CSV engine — read whole table, mutate in memory, atomic replace
data/*.csv                 the entire state of the app
```

**The pricing rule.** A submitted order carries product ids and quantities only. The server rebuilds
every line from `products.csv`, applies the discount, then tax from `settings.csv`:
`subtotal = Σ price × qty`, `discount = subtotal × %`, `tax = (subtotal − discount) × tax_percent`,
`total = subtotal − discount + tax`. Client-sent prices are ignored and `paid_amount` is capped at
`total`, so a tampered request cannot invent a discount or an overpayment.

**Each sale snapshots its own line.** `order_items` stores the name, unit price and cost price at
the moment of sale, so changing a product's price next month never rewrites history — and margin on
old orders is still computable.

**Concurrency.** Writes go through one process-wide lock and a whole-file replace. That is exactly
one uvicorn worker's worth of safety — see *Limits and what's not here* below.

**The AI path never touches storage directly.** `analytics.py` computes figures with pandas, and the
LLM receives those finished numbers as a FACTS block:

```
analytics.snapshot() ──► services/ai.py ─────────► Insights summary
analytics.snapshot() ──► services/analyst.py ────► Intelligence chat
question ──► query_analyzer.py (plan) ──► business_intelligence.py (pandas) ──► narration
                                 all four call sites share services/model.py
```

## Data model

Five tables. `id` is assigned by the engine; `created_at` / `updated_at` are stamped in local time.

| Table | Columns | Notes |
|-------|---------|-------|
| `settings` | business_name, currency, tax_percent | exactly one row, `id=1` |
| `products` | name, sku, category, price, cost_price, active | sku unique; `active=0` hides from the POS but keeps history |
| `customers` | name, phone, email | phone and email nullable |
| `orders` | order_no, customer_id, channel, status, subtotal, discount, tax, total, paid_amount, payment_method, note | `order_no` is `OB-YYMMDD-NNN`, numbered per local day |
| `order_items` | order_id, product_id, name, qty, unit_price, cost_price, line_total | price and cost copied at sale time |

Relations: `orders` 1-N `order_items`, `orders` N-1 `customers`, `order_items` N-1 `products`. There
are no joins across files — the services merge frames in memory with pandas.

The seeded demo set is 18 products across 5 categories, 7 customers, and 499 orders with 1,026 line
items spread over 90 days.

## Layout

```
app/         Vite + React SPA — no UI kit; styles.css owns the contract
  index.html  vite.config.js        mounts /src/main.jsx; proxies /api, pins :5174
  src/
    main.jsx  App.jsx               entry, then shell: ambient bg, sidebar, mobile tabs, router
    styles.css                      @theme espresso tokens + the ob-* component contract
    api.js                          fetch helpers + money/day/timeOf formatters
    useApi.js                       the shared loading/error hook
    pages/                          Dashboard Pos Orders OrderDetail Products
                                    Customers Insights Intelligence
    components/ui/                  card bento table stat-card button field badge
                                    alert segmented skeleton empty-state page
    components/charts/              trend.jsx (line + area)  bars.jsx (rankings)
    components/effects/             card-glow.jsx (+ useTilt)  meteors.jsx  number-ticker.jsx
    lib/cn.js                       clsx + tailwind-merge
backend/
  main.py                           every route lives here; CSV tables created on boot
  db.py                             storage engine — TABLES schema, types, atomic write, lock
  seed.py                           deterministic 90 days of demo history (random.seed(7))
  requirements.txt
  services/
    products.py customers.py        domain rules: catalogue, people, orders, store profile
    orders.py settings.py
    analytics.py                    every number in the app, computed with pandas
    model.py                        the ONE shared LangChain client (4 call sites import it)
    ai.py analyst.py                narration over the snapshot; the Intelligence chat
    agent.py                        request/error adapter for the agent
    business_intelligence.py        re-export shim — kept for compat, nothing imports it
    analyst_agent/                  the three-stage agent
      query_analyzer.py             question -> validated analytics plan
      business_intelligence.py      plan -> pandas BI (+ the CSV -> frame shaping)
      analyst_agent.py              stages 1 -> 2 -> 3, run_analyst_llm switch
  tests/                            37 pytest tests; writer tests monkeypatch DATA_DIR to a
                                    temp folder, and the LLM is faked throughout
data/                               THE APP'S STATE: 5 CSVs, gitignored, delete to reset
docs/superpowers/                   historical specs and plans — written against the older
                                    SQLite/Ollama design, so treat as history, not docs
.env.example                        template; copy to .env (gitignored, unlike this file)
```

## Interface

Styling is Tailwind v4 (`@tailwindcss/vite`) with the tokens declared once in `styles.css` under
`@theme`, plus `motion` for animation. No UI kit is installed: the `ob-*` classes in `styles.css`
are the same contract as the components in
[Jainil5/orderbook](https://github.com/Jainil5/orderbook), and the
[Aceternity UI](https://ui.aceternity.com/components) effects (card glow, tilt, meteors, glare
sweep, number ticker, bento grid) are re-implemented here — the animated ones in
`components/effects/`, the rest as `ob-*` classes — against this palette rather than imported. That
keeps them in the espresso theme and under reduced-motion control.

Layout rules the pages depend on:

- Cards own their padding through slots; a page never guesses at a child's spacing.
- Bento spans are literal `md:col-span-*` utilities, not a custom property — utilities outrank the
  components layer, so `xl:col-span-4` reliably overrides the default 12-track span.
- Table cells are `white-space: nowrap`. Wide tables scroll inside their own pane (`ob-scroll-x`)
  instead of wrapping; a scroll port with `maxHeight` is what makes a sticky `thead` work.
- A secondary fact folds onto a second line inside the first cell (SKU under product, phone under
  customer, channel under name) rather than becoming another column.
- Anything driven by rAF or CSS animation degrades to the correct static value: `useReducedMotion`,
  and a ticker that starts from its true number, so a hidden or throttled tab still reads right.
  Touch targets grow to 44px under `pointer-coarse:`.

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/health` | liveness probe |
| `GET/POST /api/products`, `PUT/DELETE /api/products/{id}` | catalogue; DELETE deactivates so history stays readable |
| `GET /api/customers?q=`, `POST /api/customers`, `GET /api/customers/{id}` | customer list with lifetime stats, plus their orders |
| `GET /api/orders?status=&q=&limit=`, `POST /api/orders`, `GET /api/orders/{id}`, `PATCH /api/orders/{id}` | order capture, tracking, payments |
| `GET /api/insights?days=30` or `?date_from=&date_to=` | full analytics snapshot |
| `POST /api/insights/summary?days=30` | AI prose over that snapshot |
| `GET /api/intelligence/suggestions` | starter questions for the analyst chat |
| `POST /api/intelligence/chat` | conversational answer grounded in live sales data |
| `POST /api/intelligence/agent` | plans the question, computes just the BI it needs, narrates it |
| `GET /api/dashboard` | today's numbers, open pipeline, pricing warnings |
| `GET /api/settings` | tax rate, statuses, channels, payment methods, categories in use |

Order totals are always recomputed from `products.csv` on submit — prices sent by the client are
ignored. Statuses: `open → confirmed → preparing → ready → delivered`, or `cancelled`; reopening a
cancelled order is a 409, and `paid_amount` is capped at the order total.

The two AI chat routes take JSON bodies: `POST /api/intelligence/chat` takes
`{message, history, days}` (history is the prior turns, last 10 used) and
`POST /api/intelligence/agent` takes `{question, timezone?, top_n}`. The agent route is not called
by any screen — the UI chat uses `/intelligence/chat` only. Both are easiest to exercise from
http://localhost:8000/docs.

## Limits and what's not here

Worth knowing before you rely on it:

- **Single-user by design.** No auth, no roles, no multi-brand scoping. Anyone with access to the
  machine owns the data, and `BRAND_ID` only labels the analytics context.
- **CSV scaling.** Every write rewrites the whole table under one in-process lock. That is safe for
  one uvicorn worker and thousands of orders; run two workers or a second terminal writing at the
  same time and the lock no longer protects you. The API is the only safe writer — hand-editing
  `orders.csv` can leave `order_items` disagreeing with the totals.
- **No export, print or PDF.** Nothing in the UI downloads anything. The receipt recap on the POS
  confirmation is screen-only, and the real export is the `data/*.csv` folder.
- **No refunds.** `paid_amount` is an absolute total, not a payment ledger, so reversing money means
  lowering that number — there is no refund record and no incremental payment history.
- **Catalogue and customer edits are partial.** Customers can be added but never edited or deleted;
  a deactivated product comes back only by editing it and re-ticking Active.
- **List view is capped.** The Orders page asks for 200 rows (the API allows up to 500) and has no
  pagination or date filter.
- **Currency is half-wired.** `settings.csv` has a `currency` column and the AI prose uses it, but
  the frontend formats every amount as INR unconditionally — change the column and the KPI cards
  still print ₹.
- **Insights has presets, not a custom range.** 7 / 30 / 90 days in the UI, though the API accepts
  arbitrary `date_from` / `date_to`.
- **Two sets of sales numbers.** The agent counts delivered-and-fully-paid orders, Insights counts
  everything not cancelled. See the reconciliation note below before comparing them.
- **Offers are vocabulary, not data.** The agent can plan an `offer_analysis`, but the schema has no
  promotions table, so it always comes back empty.

## Model

`services/model.py` builds one shared LangChain client and all four AI call sites import it:
`ai.py`, `analyst.py`, the query planner in `analyst_agent/query_analyzer.py`, and the narrator in
`analyst_agent/analyst_agent.py`.

```python
ChatNVIDIA(model="nvidia/nemotron-3.5-lightning-30b-a3b",
           temperature=0.2, max_tokens=8192, timeout=300)
```

It is keyed by `NVIDIA_API_KEY` (or `LLM_API_KEY`). `ChatOpenAI` and `ChatOllama` variants are
commented in the same file — to run offline, comment the NVIDIA block and uncomment Ollama.
`LLM_MODEL` is display-only: `ai.py` reads it into `MODEL`, which labels the summary and chat
responses and appears in the 503 message; if unset it falls back to the model string on the client.
`OLLAMA_MODEL`, `OLLAMA_URL` and `OLLAMA_THINKING` are read by nothing until the client becomes
`ChatOllama`.

Everything the model sees was already computed by pandas. `services/ai.py` hands it the FACTS block
from `analytics.snapshot()` and asks for two sections — Performance, and Margins and mix — a
summary of the current data only, never recommendations or next steps. The model never queries the
store and never produces a figure of its own, so a bad AI response can only be bad prose: the
numbers on screen stay correct. If the provider is unreachable or the key is missing the endpoint
returns 503 naming the model, and the UI says so while still showing every KPI. Everything except
the AI text works offline with no key at all.

## Intelligence — AI sales analyst

The `/intelligence` page is a chat over your live sales data. Concept ported from
[Jainil5/ai-sales-analyst](https://github.com/Jainil5/ai-sales-analyst), rewired from its sample
dataset to this app's CSV-backed analytics.

`POST /api/intelligence/chat` (`services/analyst.py`) computes the facts and lets the model narrate
them as plain conversational prose — it can never fabricate a number and emits no charts, tables,
or JSON. The last 10 turns are resent with each question so follow-ups work; history lives only in
browser memory, nothing is written to disk.

### `POST /api/intelligence/agent` — the full agent

`services/analyst_agent/` is a three-stage pipeline reached through the thin adapter in
`services/agent.py`, which turns the agent's `ValueError`s into 422s and provider failures into 503s.

1. **Query plan** (`query_analyzer.py`) — the LLM answers with JSON only: `intent` (one of 18,
   including `unsupported`), `domains` (sales, products, customers, payments, offers, retention,
   profitability, trends, business), `metrics` (34 supported), `period` and `comparison` date
   boundaries resolved in `BUSINESS_TIMEZONE`, `filters` (product, category, customer,
   payment_method, order_status), plus `clarification_required`, `confidence` and `reason`. The plan
   is validated against those sets, so a question outside the vocabulary is refused or bounced back
   as one clarifying question rather than guessed at.
2. **Business intelligence** (`business_intelligence.py`) — pandas computes only what the plan asked
   for, through `analyze_sales`, `analyze_products`, `analyze_customers`, `analyze_payments`,
   `analyze_offers`, and `build_business_context`.
3. **Narration** — a second LLM call turns the BI JSON into prose. `run_analyst_llm=False` stops
   after stage 2 so you can inspect the classification and the figures without a model call.

The response returns all three stages — `question`, `query_plan`, `bi_json`, `answer` — so you can
check the reasoning against the numbers. `brand_id` comes from `BRAND_ID` in `.env` and never from
the request.

Note that the agent counts a narrower set of orders than the rest of the app.
`QUALIFYING_ORDER_STATUSES = {"completed"}` and `QUALIFYING_PAYMENT_STATUSES = {"paid"}`, and
`fetch_business_data` maps the CSV `delivered` status to `completed` and derives `payment_status`
by comparing `paid_amount` to `total` — so an order counts only once it is delivered **and** fully
paid, while `services/analytics.py` counts every order except `cancelled`. On the demo data the
last 30 days read ₹75,642 over 157 orders in Insights but ₹66,005 over 143 orders through the
agent. Reconcile the two before showing them side by side. Offers are the one domain with no data:
the CSV schema has no promotions table, so `analyze_offers` always comes back empty and payments
are derived from the orders rows.

## Environment

Copy `.env.example` to `.env` at the project root — `services/model.py` and the agent load it with
`python-dotenv`. `.env` and `data/` are gitignored; keep your key out of the repo.

| Variable | Default | Notes |
|----------|---------|-------|
| `NVIDIA_API_KEY` / `LLM_API_KEY` | — | read by `services/model.py`; the app runs without either, minus the AI text |
| `LLM_MODEL` | client's model | display-only label in the UI and API responses |
| `BRAND_ID` | `local` | labels the agent's context; never taken from the request |
| `BUSINESS_TIMEZONE` | `Asia/Kolkata` | how the agent resolves "this month" or "last week" |

## Tests

```bash
.venv/bin/python -m pytest backend/tests
```

37 tests, the model client mocked throughout — they check the CSV store, the pandas figures, the
agent's plan validation and the API contracts without any provider or network. Writer tests move
`DATA_DIR` into a pytest temp folder, so they never touch your real `data/`. `cd app && npm run
build` is the frontend check; the SPA has no test or lint config of its own.

## Working with it

- **Change tax or the business name** — edit `data/settings.csv` (one row, `id=1`) and restart
  nothing; the next request reads it.
- **Backup, move, or reset** — `data/` is the whole app state. Copy the folder to back it up,
  delete it to start over.
- **Repricing is safe** — a sale snapshots name, unit price and cost into `order_items`, so editing
  a product never rewrites past orders or their margin.
- **Poke the API directly** at http://localhost:8000/docs — it is the only way to reach
  `/api/intelligence/agent` and arbitrary `date_from` / `date_to` ranges today.
- **One rough edge** — the Insights summary error still reads "Retry when Ollama is reachable",
  leftover wording from the previous provider. The model actually used is whatever
  `services/model.py` builds.
