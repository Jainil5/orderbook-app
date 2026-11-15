"""POST /api/intelligence/agent.

The query planner and the analyst model are mocked; the pandas BI stage and the
CSV store are real, so the payload the agent answers from is genuinely computed.

The fakes are installed with monkeypatch rather than patch.object: `llm` is a
lazy proxy that builds its provider client on first attribute access, and mock's
introspection would trip it.
"""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend import db
from backend.services.main import app
from backend.services.analyst_agent import analyst_agent


class FakeLLM:
    def __init__(self, content=None, error=None):
        self.content = content
        self.error = error
        self.prompts = []

    def invoke(self, messages):
        self.prompts.append(messages)
        if self.error:
            raise self.error
        return SimpleNamespace(content=self.content)


@pytest.fixture
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA_DIR", tmp_path / "data")
    db.init_db()
    return db


@pytest.fixture
def client(store):
    """A client over an empty temp store holding one delivered order."""
    with TestClient(app) as c:
        product = c.post("/api/products", json={"name": "Espresso", "price": 90}).json()
        order = c.post("/api/orders",
                       json={"items": [{"product_id": product["id"], "qty": 2}]}).json()
        c.patch(f"/api/orders/{order['id']}", json={"status": "delivered"})
        yield c


def _plan(**overrides) -> dict:
    """A plan as query_analyzer would return it, spanning the seeded order."""
    plan = {
        "schema_version": "1.0",
        "question": "How much revenue have we made lately?",
        "normalized_question": "revenue for the last 60 days",
        "intent": "sales_overview",
        "domains": ["sales"],
        "metrics": ["net_sales"],
        "period": {
            "type": "custom",
            "start_date": (date.today() - timedelta(days=60)).isoformat(),
            "end_date": date.today().isoformat(),
            "source_text": "lately",
            "timezone": "Asia/Kolkata",
        },
        "comparison": {"type": "none"},
        "granularity": "day",
        "filters": {},
        "requires_full_context": False,
        "clarification_required": False,
        "clarification_question": None,
        "confidence": 0.9,
        "reason": "",
    }
    return {**plan, **overrides}


def ask(client, monkeypatch, plan=None, llm=None, question="How much revenue have we made lately?", **body):
    """Call the route with the planner and analyst model swapped out."""
    monkeypatch.setattr(analyst_agent, "analyze_query", lambda **kwargs: plan or _plan())
    llm = llm or FakeLLM("Revenue held steady.")
    monkeypatch.setattr(analyst_agent, "llm", llm)
    res = client.post("/api/intelligence/agent", json={"question": question, **body})
    return res, llm


def test_agent_answers_from_computed_bi(client, monkeypatch):
    res, llm = ask(client, monkeypatch)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["answer"] == "Revenue held steady."
    assert body["query_plan"]["intent"] == "sales_overview"
    assert body["bi_json"]["status"] == "ok"
    summary = body["bi_json"]["current_period"]["sales_analytics"]["summary"]
    assert summary["orders"] == 1
    assert summary["net_sales"] == 180.0
    # The analyst model is shown the computed figures, not just the question.
    assert "180" in str(llm.prompts)


def test_agent_only_counts_qualifying_orders(client, monkeypatch):
    future = (date.today() + timedelta(days=1)).isoformat()
    res, _ = ask(client, monkeypatch,
                 plan=_plan(period={**_plan()["period"], "start_date": future}),
                 question="next week?")
    summary = res.json()["bi_json"]["current_period"]["sales_analytics"]["summary"]
    assert summary["orders"] == 0


def test_agent_clarification_skips_the_data_fetch(client, monkeypatch):
    plan = _plan(clarification_required=True, clarification_question="Which week?")
    res, llm = ask(client, monkeypatch, plan=plan,
                   llm=FakeLLM("Which week?"), question="sales?")
    assert res.status_code == 200
    assert res.json()["bi_json"]["status"] == "clarification_required"
    assert res.json()["answer"] == "Which week?"


def test_agent_blank_question_never_reaches_the_model(client, monkeypatch):
    llm = FakeLLM("unused")
    monkeypatch.setattr(analyst_agent, "llm", llm)
    res = client.post("/api/intelligence/agent", json={"question": "   "})
    assert res.status_code == 422
    assert llm.prompts == []


def test_agent_unknown_timezone_422(client):
    res = client.post("/api/intelligence/agent",
                      json={"question": "revenue?", "timezone": "Mars/Phobos"})
    assert res.status_code == 422
    assert "unknown timezone" in str(res.json()["detail"])


def test_agent_provider_down_503(client, monkeypatch):
    res, _ = ask(client, monkeypatch, llm=FakeLLM(error=RuntimeError("connection refused")))
    assert res.status_code == 503
    assert "AI unavailable" in res.json()["detail"]
