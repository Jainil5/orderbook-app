"""CSV-backed storage for one brand. Each table is one CSV file in data/.

The structure mirrors the original relational schema: settings, products,
customers, orders, order_items. There is no SQL engine — rows are loaded,
modified in memory, and written back as a whole file (atomic replace). A
process-wide lock serializes writes so concurrent API requests cannot
clobber each other.
"""
import csv
import os
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE.parent / "data"

# column -> (type, default). A None default marks the column nullable.
# "id" is auto-assigned; created_at/updated_at default to the local time.
TABLES: dict[str, dict[str, tuple]] = {
    "settings": {
        "id": ("int", None),
        "business_name": ("str", "My Store"),
        "currency": ("str", "INR"),
        "tax_percent": ("float", 5.0),
    },
    "products": {
        "id": ("int", None),
        "name": ("str", None),
        "sku": ("str", None),
        "category": ("str", "General"),
        "price": ("float", 0.0),
        "cost_price": ("float", 0.0),
        "active": ("int", 1),
        "created_at": ("str", None),
    },
    "customers": {
        "id": ("int", None),
        "name": ("str", None),
        "phone": ("str", None),
        "email": ("str", None),
        "created_at": ("str", None),
    },
    # status flow: open -> confirmed -> preparing -> ready -> delivered, or cancelled
    "orders": {
        "id": ("int", None),
        "order_no": ("str", None),
        "customer_id": ("int", None),
        "channel": ("str", "counter"),
        "status": ("str", "open"),
        "subtotal": ("float", 0.0),
        "discount": ("float", 0.0),
        "tax": ("float", 0.0),
        "total": ("float", 0.0),
        "paid_amount": ("float", 0.0),
        "payment_method": ("str", "cash"),
        "note": ("str", None),
        "created_at": ("str", None),
        "updated_at": ("str", None),
    },
    "order_items": {
        "id": ("int", None),
        "order_id": ("int", None),
        "product_id": ("int", None),
        "name": ("str", None),
        "qty": ("int", 0),
        "unit_price": ("float", 0.0),
        "cost_price": ("float", 0.0),
        "line_total": ("float", 0.0),
    },
}

_LOCK = threading.RLock()


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def columns(table: str) -> list[str]:
    return list(TABLES[table])


def _path(table: str) -> Path:
    return DATA_DIR / f"{table}.csv"


def _cast(table: str, raw: dict) -> dict:
    """CSV strings -> typed Python values. Empty cells become None/defaults."""
    row = {}
    for col, (kind, default) in TABLES[table].items():
        value = raw.get(col)
        if value is None or value == "":
            row[col] = default
        elif kind == "int":
            row[col] = int(float(value))
        elif kind == "float":
            row[col] = float(value)
        else:
            row[col] = value
    return row


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(int(value))
    return str(value)


def _write_rows(table: str, rows: list[dict]) -> None:
    """Write the whole table atomically: temp file, then replace."""
    path = _path(table)
    tmp = path.with_suffix(".csv.tmp")
    cols = columns(table)
    with tmp.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: _cell(row.get(col)) for col in cols})
    os.replace(tmp, path)


def init_db() -> None:
    """Create data/ and any missing CSV files; ensure the settings row exists."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        for table in TABLES:
            if not _path(table).exists():
                _write_rows(table, [])
        if not any(r["id"] == 1 for r in read("settings")):
            insert("settings", id=1)


def read(table: str) -> list[dict]:
    path = _path(table)
    if not path.exists():
        init_db()
    with path.open(newline="") as f:
        return [_cast(table, raw) for raw in csv.DictReader(f)]


def write(table: str, rows: list[dict]) -> None:
    """Replace a whole table (used by the seeder)."""
    with _LOCK:
        _write_rows(table, rows)


def get(table: str, row_id: int) -> dict | None:
    return next((r for r in read(table) if r["id"] == row_id), None)


def insert(table: str, **fields) -> dict:
    """Append one row with auto id, defaults, and timestamps. Returns the row."""
    with _LOCK:
        rows = read(table)
        row = {}
        for col, (_kind, default) in TABLES[table].items():
            if col in fields:
                row[col] = fields[col]
            elif col == "id":
                row[col] = max((r["id"] for r in rows), default=0) + 1
            elif col in ("created_at", "updated_at"):
                row[col] = now()
            else:
                row[col] = default
        rows.append(row)
        _write_rows(table, rows)
        return dict(row)


def update(table: str, row_id: int, **fields) -> dict | None:
    with _LOCK:
        rows = read(table)
        for row in rows:
            if row["id"] == row_id:
                row.update({k: v for k, v in fields.items() if k in TABLES[table]})
                if "updated_at" in TABLES[table]:
                    row["updated_at"] = now()
                _write_rows(table, rows)
                return dict(row)
    return None


@contextmanager
def transaction():
    """Hold the write lock across several inserts/updates (e.g. order + items)."""
    with _LOCK:
        yield
