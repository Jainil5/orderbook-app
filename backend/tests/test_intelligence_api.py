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
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = "Doing well — revenue is steady."
        res = client.post("/api/intelligence/chat", json={"message": "How are sales?"})
    assert res.status_code == 200
    body = res.json()
    assert body["answer"] == "Doing well — revenue is steady."
    assert "charts" not in body


def test_chat_empty_message_422():
    res = client.post("/api/intelligence/chat", json={"message": "  "})
    assert res.status_code == 422


def test_chat_ai_down_503():
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.side_effect = RuntimeError("down")
        res = client.post("/api/intelligence/chat", json={"message": "How are sales?"})
    assert res.status_code == 503
    assert "AI unavailable" in res.json()["detail"]