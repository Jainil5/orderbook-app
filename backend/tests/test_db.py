import pytest
from fastapi.testclient import TestClient

from backend import db


@pytest.fixture
def store(tmp_path, monkeypatch):
    """Point the CSV store at a temp folder so tests never touch real data."""
    monkeypatch.setattr(db, "DATA_DIR", tmp_path / "data")
    db.init_db()
    return db


def test_init_creates_one_csv_per_table(store):
    for table in db.TABLES:
        assert (store.DATA_DIR / f"{table}.csv").exists()
    settings = store.get("settings", 1)
    assert settings["business_name"] == "My Store"
    assert settings["currency"] == "INR"
    assert settings["tax_percent"] == 5.0


def test_insert_get_update_roundtrip(store):
    row = store.insert("products", name="Latte", price=180.0, cost_price=48.0)
    assert row["id"] == 1
    assert row["active"] == 1
    assert row["created_at"]

    fetched = store.get("products", 1)
    assert fetched["name"] == "Latte"
    assert fetched["price"] == 180.0

    store.update("products", 1, price=190.0, active=0)
    again = store.get("products", 1)
    assert again["price"] == 190.0
    assert again["active"] == 0
    assert store.get("products", 999) is None


def test_ids_increment_and_nullable_cells(store):
    store.insert("customers", name="Asha", phone=None, email=None)
    second = store.insert("customers", name="Ravi", phone="9820114455")
    assert second["id"] == 2
    assert store.get("customers", 1)["phone"] is None
    assert store.get("customers", 2)["phone"] == "9820114455"


def test_order_api_roundtrip(store):
    from backend.services.main import app

    with TestClient(app) as client:
        product = client.post("/api/products",
                              json={"name": "Espresso", "price": 90, "cost_price": 22}).json()
        customer = client.post("/api/customers",
                               json={"name": "Ananya Rao", "phone": "9820114455"}).json()
        res = client.post("/api/orders", json={
            "items": [{"product_id": product["id"], "qty": 2}],
            "customer_id": customer["id"],
            "discount_percent": 10,
            "payment_method": "upi",
        })
        assert res.status_code == 200
        order = res.json()
        # 2 x 90 = 180, 10% off = 162, 5% tax = 8.10 -> 170.10
        assert order["subtotal"] == 180.0
        assert order["total"] == 170.1
        assert order["paid_amount"] == 170.1
        assert order["customer_name"] == "Ananya Rao"
        assert order["items"][0]["qty"] == 2
        assert order["order_no"].startswith("OB-")

        patched = client.patch(f"/api/orders/{order['id']}",
                               json={"status": "delivered"}).json()
        assert patched["status"] == "delivered"

        listed = client.get("/api/orders", params={"q": "ananya"}).json()
        assert [o["id"] for o in listed] == [order["id"]]

        detail = client.get(f"/api/customers/{customer['id']}").json()
        assert detail["stats"]["orders"] == 1
        assert detail["stats"]["revenue"] == 170.1

        snapshot = client.get("/api/insights", params={"days": 30}).json()
        assert snapshot["totals"]["orders"] == 1
        assert snapshot["totals"]["revenue"] == 170.1
        assert snapshot["top_products"][0]["product"] == "Espresso"


def test_phone_is_the_customer_key(store):
    from backend.services.main import app

    with TestClient(app) as client:
        product = client.post("/api/products",
                              json={"name": "Cold Brew", "price": 120, "cost_price": 40}).json()

        # A name alone no longer opens a record — the number is the identity.
        assert client.post("/api/customers", json={"name": "No Number"}).status_code == 422

        # Submitting an unseen number creates the customer as part of the sale.
        seen = client.post("/api/orders", json={
            "items": [{"product_id": product["id"], "qty": 1}],
            "customer_phone": "98765 43210",
        }).json()
        assert seen["customer_name"] == "9876543210"
        rows = client.get("/api/customers", params={"q": "98765"}).json()
        assert [c["id"] for c in rows] == [seen["customer_id"]]
        assert rows[0]["name"] is None and rows[0]["display"] == "9876543210"

        # The same number dialled differently must not open a second record.
        again = client.post("/api/orders", json={
            "items": [{"product_id": product["id"], "qty": 1}],
            "customer_phone": "98765-43210",
        }).json()
        assert again["customer_id"] == seen["customer_id"]

        assert client.post("/api/customers", json={"phone": "9876543210"}).status_code == 409

        # Given a name, it wins over the number as the label.
        named = client.post("/api/orders", json={
            "items": [{"product_id": product["id"], "qty": 1}],
            "customer_phone": "9000011112", "customer_name": "Ramesh",
        }).json()
        assert named["customer_name"] == "Ramesh"

        # The no-number escape still sells, and stays a walk-in.
        walkin = client.post("/api/orders", json={
            "items": [{"product_id": product["id"], "qty": 1}],
        }).json()
        assert walkin["customer_id"] is None and walkin["customer_name"] is None

        # Nothing blank may reach the model, or it fills the gap itself.
        snapshot = client.get("/api/insights", params={"days": 30}).json()
        assert all(row["customer"] for row in snapshot["top_customers"])
