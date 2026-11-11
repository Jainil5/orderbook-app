"""Seed 90 days of believable history so analytics has something real to report.

    python3 -m backend.seed          # only fills an empty database
    python3 -m backend.seed --force  # wipes products/customers/orders first
"""
import random
from datetime import date, datetime, timedelta

from backend import db

random.seed(7)

PRODUCTS = [
    ("Espresso", "COF-01", "Coffee", 90, 22),
    ("Cortado", "COF-02", "Coffee", 120, 30),
    ("Flat White", "COF-03", "Coffee", 160, 44),
    ("Cappuccino", "COF-04", "Coffee", 170, 46),
    ("Latte", "COF-05", "Coffee", 180, 48),
    ("Iced Latte", "COF-06", "Coffee", 190, 52),
    ("Cold Brew", "COF-07", "Coffee", 210, 58),
    ("Filter Coffee", "COF-08", "Coffee", 110, 26),
    ("Hot Chocolate", "BEV-01", "Beverages", 165, 48),
    ("Masala Chai", "BEV-02", "Beverages", 80, 18),
    ("Avocado Toast", "FOOD-01", "Food", 260, 105),
    ("Paneer Sandwich", "FOOD-02", "Food", 220, 82),
    ("Croissant", "BAK-01", "Bakery", 130, 42),
    ("Blueberry Muffin", "BAK-02", "Bakery", 140, 45),
    ("Banana Bread", "BAK-03", "Bakery", 150, 47),
    ("Cheesecake Slice", "BAK-04", "Bakery", 280, 120),
    ("House Beans 250g", "RTL-01", "Retail", 520, 300),
    ("Ceramic Mug", "RTL-02", "Retail", 350, 210),
]

CUSTOMERS = [
    ("Ananya Rao", "9820114455", "ananya.rao@example.com"),
    ("Vikram Shah", "9833221100", "vikram.shah@example.com"),
    ("Meera Iyer", "9900445566", "meera.iyer@example.com"),
    ("Farhan Qureshi", "9892334411", None),
    ("Divya Menon", "9811223344", "divya.menon@example.com"),
    ("Rohit Bhatia", "9773001122", None),
    ("Sana Kapoor", "9655443322", "sana.kapoor@example.com"),
]

# How many of each product, weighted so the margins actually differ.
WEIGHTS = {"Coffee": 46, "Beverages": 12, "Food": 16, "Bakery": 18, "Retail": 8}
CHANNELS = [("counter", 62), ("online", 27), ("phone", 11)]
PAYMENTS = [("upi", 48), ("cash", 30), ("card", 15), ("credit", 7)]


def _pick(weighted: list[tuple[str, int]]) -> str:
    total = sum(w for _, w in weighted)
    roll = random.uniform(0, total)
    acc = 0
    for value, weight in weighted:
        acc += weight
        if roll <= acc:
            return value
    return weighted[-1][0]


def _status_for(day: date) -> str:
    age = (date.today() - day).days
    if age >= 3:
        return "cancelled" if random.random() < 0.05 else "delivered"
    return random.choices(
        ["open", "confirmed", "preparing", "ready", "delivered"],
        weights=[22, 24, 18, 16, 20],
    )[0]


def _wipe(conn) -> None:
    for table in ("order_items", "orders", "customers", "products"):
        conn.execute(f"DELETE FROM {table}")
    conn.execute("DELETE FROM sqlite_sequence")


def run(force: bool = False) -> dict:
    db.init_db()
    with db.tx() as conn:
        existing = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if existing and not force:
            return {"skipped": True, "products": existing,
                    "orders": conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]}
        if existing:
            _wipe(conn)

        product_ids: dict[int, dict] = {}
        for name, sku, category, price, cost in PRODUCTS:
            row = conn.execute(
                "INSERT INTO products (name, sku, category, price, cost_price, active) VALUES (?, ?, ?, ?, ?, 1)",
                (name, sku, category, price, cost),
            )
            product_ids[row.lastrowid] = {"id": row.lastrowid, "name": name,
                                          "category": category, "price": price, "cost": cost}
        cat_products: dict[str, list[dict]] = {}
        for product in product_ids.values():
            cat_products.setdefault(product["category"], []).append(product)

        customer_ids = [
            conn.execute("INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)", person).lastrowid
            for person in CUSTOMERS
        ]

        tax_percent = conn.execute("SELECT tax_percent FROM settings WHERE id = 1").fetchone()[0]
        created = 0
        for back in range(90, -1, -1):
            day = date.today() - timedelta(days=back)
            # Weekends and Mondays differ; Friday is the busiest.
            base = {0: 5, 1: 3, 2: 4, 3: 4, 4: 5, 5: 7, 6: 6}[day.weekday()]
            for seq in range(1, base + random.randint(0, 4)):
                chosen = []
                for _ in range(random.choices([1, 2, 3, 4], weights=[34, 34, 22, 10])[0]):
                    category = _pick(list(WEIGHTS.items()))
                    product = random.choice(cat_products[category])
                    qty = random.choices([1, 2, 3], weights=[78, 18, 4])[0]
                    chosen.append((product, qty))
                when = datetime(day.year, day.month, day.day,
                                random.randint(8, 20), random.choice([5, 15, 25, 40, 55]))
                subtotal = round(sum(p["price"] * q for p, q in chosen), 2)
                discount_pct = random.choice([0, 0, 0, 5, 10, 15])
                discount = round(subtotal * discount_pct / 100, 2)
                tax_amount = round((subtotal - discount) * tax_percent / 100, 2)
                total = round(subtotal - discount + tax_amount, 2)
                method = _pick(PAYMENTS)
                status = _status_for(day)
                if status == "cancelled":
                    paid = 0.0
                elif method == "credit":
                    paid = round(total * random.choice([0, 0.5]), 2)
                else:
                    paid = total
                # Walk-ins on the counter usually have no customer record.
                channel = _pick(CHANNELS)
                customer_id = None
                if channel != "counter" or random.random() < 0.28:
                    customer_id = random.choice(customer_ids)

                oid = conn.execute(
                    """INSERT INTO orders (order_no, customer_id, channel, status, subtotal,
                                          discount, tax, total, paid_amount, payment_method,
                                          created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (f"OB-{day:%y%m%d}-{seq:03d}", customer_id, channel, status, subtotal,
                     discount, tax_amount, total, paid, method,
                     when.strftime("%Y-%m-%d %H:%M:%S"), when.strftime("%Y-%m-%d %H:%M:%S")),
                ).lastrowid
                for product, qty in chosen:
                    conn.execute(
                        """INSERT INTO order_items (order_id, product_id, name, qty, unit_price,
                                                   cost_price, line_total)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (oid, product["id"], product["name"], qty, product["price"],
                         product["cost"], round(product["price"] * qty, 2)),
                    )
                created += 1
    return {"skipped": False, "products": len(PRODUCTS), "customers": len(CUSTOMERS),
            "orders": created}


if __name__ == "__main__":
    import sys
    print(run("--force" in sys.argv))
