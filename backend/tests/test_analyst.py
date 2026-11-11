from unittest.mock import patch

import pytest

from backend.services import ai, analyst


def test_suggestions_nonempty():
    assert len(analyst.SUGGESTIONS) >= 4
    assert all(isinstance(s, str) and s for s in analyst.SUGGESTIONS)


def test_answer_happy_path(snapshot):
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = "Revenue is steady this month."
        result = analyst.answer("How are sales?", [])
    assert result["answer"] == "Revenue is steady this month."
    assert "charts" not in result
    assert result["model"] == ai.MODEL
    assert result["generated_at"]


def test_answer_strips_markdown_bold(snapshot):
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = "**Revenue** is up."
        result = analyst.answer("How are sales?", [])
    assert result["answer"] == "Revenue is up."


def test_answer_empty_reply_raises():
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = "   "
        with pytest.raises(ai.AiUnavailable):
            analyst.answer("How are sales?", [])


def test_answer_llm_failure_raises():
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.side_effect = RuntimeError("connection refused")
        with pytest.raises(ai.AiUnavailable):
            analyst.answer("How are sales?", [])


def test_answer_history_capped(snapshot):
    history = [{"role": "user", "content": f"q{i}"} for i in range(20)]
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = "ok"
        analyst.answer("latest?", history)
        prompt = Mock.return_value.invoke.call_args[0][0]
    assert "q0" not in prompt and "q19" in prompt


def test_prompt_grounds_in_facts(snapshot):
    with patch.object(analyst, "ChatOllama") as Mock:
        Mock.return_value.invoke.return_value.content = "ok"
        analyst.answer("How are sales?", [])
        prompt = Mock.return_value.invoke.call_args[0][0]
    assert "FACTS" in prompt
    assert "Never invent" in prompt