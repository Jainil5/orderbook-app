import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "orderbook.db"
SCHEMA = (HERE / "schema.sql").read_text()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        conn.execute("INSERT OR IGNORE INTO settings (id) VALUES (1)")


@contextmanager
def tx():
    """One read-write transaction. Writes that span tables use this."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list[dict]:
    with closing(connect()) as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def scalar(sql: str, params: tuple = ()):
    with closing(connect()) as conn:
        row = conn.execute(sql, params).fetchone()
        return row[0] if row else None


def insert(sql: str, params: tuple = ()) -> int:
    with tx() as conn:
        return conn.execute(sql, params).lastrowid
