from datetime import date, datetime
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest

import sys
from pathlib import Path

# Ensure backend/services/analyst_agent is importable
agent_dir = str(Path(__file__).resolve().parent.parent / "services" / "analyst_agent")
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

# Set dummy key so model initialization doesn't raise if unset
import os
os.environ.setdefault("OPENAI_API_KEY", "test-mock-key")

from analyst_agent import (
    _json_default,
    _json_safe,
    _period_from_plan,
    _filter_data_for_plan,
    execute_business_intelligence,
    generate_business_answer,
    ask_business_analyst,
)


class TestAnalystAgentUtilities:
    def test_json_default_and_safe(self):
        d = date(2026, 3, 15)
        dt = datetime(2026, 3, 15, 12, 0, 0)
        s = pd.Series([10]).iloc[0]  # numpy scalar

        payload = {"date": d, "datetime": dt, "scalar": s}
        safe_result = _json_safe(payload)

        assert safe_result["date"] == "2026-03-15"
        assert "2026-03-15T12:00:00" in safe_result["datetime"]
        assert safe_result["scalar"] == 10

    def test_period_from_plan_valid(self):
        plan = {
            "period": {
                "start_date": "2026-01-01",
                "end_date": "2026-01-31",
            }
        }
        start, end = _period_from_plan(plan)
        assert start == "2026-01-01"
        assert end == "2026-01-31"

    def test_period_from_plan_missing_raises(self):
        with pytest.raises(ValueError, match="missing period date boundaries"):
            _period_from_plan({"period": {"start_date": "2026-01-01"}})

        with pytest.raises(ValueError, match="missing comparison date boundaries"):
            _period_from_plan({}, key="comparison")


class TestFilterDataForPlan:
    @pytest.fixture
    def sample_data(self):
        orders = pd.DataFrame([
            {"id": "o1", "customer_id": "c1", "order_status": "completed", "payment_method": "upi"},
            {"id": "o2", "customer_id": "c2", "order_status": "cancelled", "payment_method": "cash"},
            {"id": "o3", "customer_id": "c1", "order_status": "completed", "payment_method": "card"},
        ])
        customers = pd.DataFrame([
            {"id": "c1", "customer_name": "Alice Wonderland"},
            {"id": "c2", "customer_name": "Bob Builder"},
        ])
        order_items = pd.DataFrame([
            {"order_id": "o1", "product_name": "Espresso Roast", "category": "Coffee"},
            {"order_id": "o2", "product_name": "Green Tea", "category": "Tea"},
            {"order_id": "o3", "product_name": "Latte Cup", "category": "Merch"},
        ])
        return {"orders": orders, "customers": customers, "order_items": order_items}

    def test_filter_by_order_status_and_payment_method(self, sample_data):
        filters = {"order_status": "completed", "payment_method": "upi"}
        filtered, warnings = _filter_data_for_plan(sample_data, filters)
        assert len(filtered["orders"]) == 1
        assert filtered["orders"].iloc[0]["id"] == "o1"
        assert warnings == []

    def test_filter_by_customer_name(self, sample_data):
        filters = {"customer_name": "Alice"}
        filtered, warnings = _filter_data_for_plan(sample_data, filters)
        assert set(filtered["orders"]["id"]) == {"o1", "o3"}
        assert warnings == []

    def test_filter_by_customer_name_not_found(self, sample_data):
        filters = {"customer_name": "NonExistent"}
        filtered, warnings = _filter_data_for_plan(sample_data, filters)
        assert len(filtered["orders"]) == 0
        assert any("No customer matched" in w for w in warnings)

    def test_filter_by_product_name(self, sample_data):
        filters = {"product_name": "Espresso"}
        filtered, warnings = _filter_data_for_plan(sample_data, filters)
        assert list(filtered["orders"]["id"]) == ["o1"]
        assert list(filtered["order_items"]["product_name"]) == ["Espresso Roast"]
        assert warnings == []

    def test_filter_by_category(self, sample_data):
        filters = {"category": "Coffee"}
        filtered, warnings = _filter_data_for_plan(sample_data, filters)
        assert list(filtered["orders"]["id"]) == ["o1"]
        assert warnings == []


class TestExecuteBusinessIntelligence:
    def test_clarification_required(self):
        plan = {
            "clarification_required": True,
            "clarification_question": "Do you want data for this week or last week?",
            "period": {"start_date": "2026-03-01", "end_date": "2026-03-07"},
        }
        res = execute_business_intelligence(data={}, plan=plan, brand_id="b1")
        assert res["status"] == "clarification_required"
        assert "this week or last week" in res["message"]

    @patch("analyst_agent.analyze_sales")
    @patch("analyst_agent.analyze_products")
    def test_execute_focused_domains_with_comparison(self, mock_products, mock_sales):
        mock_sales.return_value = {"total_sales": 1000}
        mock_products.return_value = {"top_products": [{"name": "Coffee"}]}

        plan = {
            "clarification_required": False,
            "domains": ["sales", "products"],
            "period": {
                "start_date": "2026-03-01",
                "end_date": "2026-03-07",
                "timezone": "Asia/Kolkata",
            },
            "comparison": {
                "type": "previous_period",
                "start_date": "2026-02-22",
                "end_date": "2026-02-28",
            },
            "filters": {"order_status": "completed"},
        }
        data = {
            "orders": pd.DataFrame([{"id": "o1", "order_status": "completed"}]),
            "order_items": pd.DataFrame(),
            "products": pd.DataFrame(),
        }

        res = execute_business_intelligence(data=data, plan=plan, brand_id="test-brand")
        assert res["status"] == "ok"
        assert "sales_analytics" in res["current_period"]
        assert "product_analytics" in res["current_period"]
        assert res["comparison_period"] is not None
        assert res["comparison_type"] == "previous_period"
        assert res["filters_applied"] == {"order_status": "completed"}

    @patch("analyst_agent.build_business_context")
    def test_execute_full_context_for_business_overview(self, mock_context):
        mock_context.return_value = {"overview": "all good"}
        plan = {
            "clarification_required": False,
            "intent": "business_overview",
            "period": {"start_date": "2026-03-01", "end_date": "2026-03-07"},
            "comparison": {"type": "none"},
        }
        res = execute_business_intelligence(data={}, plan=plan, brand_id="test-brand")
        assert res["status"] == "ok"
        assert res["current_period"] == {"overview": "all good"}
        assert res["comparison_period"] is None
        mock_context.assert_called_once()


class TestGenerateBusinessAnswer:
    def test_generate_answer_success(self):
        mock_response = MagicMock()
        mock_response.content = "Sales are up 20% week-over-week."
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_response

        with patch("analyst_agent.llm", mock_llm):
            answer = generate_business_answer(
                question="How are sales?",
                plan={"domains": ["sales"]},
                bi_json={"status": "ok"},
            )
        assert answer == "Sales are up 20% week-over-week."

    def test_generate_answer_empty_raises(self):
        mock_response = MagicMock()
        mock_response.content = "   "
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_response

        with patch("analyst_agent.llm", mock_llm):
            with pytest.raises(ValueError, match="empty answer"):
                generate_business_answer("How are sales?", {}, {})



class TestAskBusinessAnalyst:
    def test_invalid_arguments(self):
        with pytest.raises(ValueError, match="question must be a non-empty string"):
            ask_business_analyst("", brand_id="b1")

        with pytest.raises(ValueError, match="authorized brand_id is required"):
            ask_business_analyst("Valid question", brand_id="")

    @patch("analyst_agent.analyze_query")
    def test_clarification_path_bypasses_data_fetch(self, mock_analyze_query):
        mock_analyze_query.return_value = {
            "clarification_required": True,
            "clarification_question": "Which product category do you mean?",
        }

        res = ask_business_analyst(
            question="Tell me about sales",
            brand_id="b1",
            run_analyst_llm=False,
        )

        assert res["bi_json"]["status"] == "clarification_required"
        assert res["answer"] == "Which product category do you mean?"

    @patch("analyst_agent.generate_business_answer")
    @patch("analyst_agent.execute_business_intelligence")
    @patch("analyst_agent.fetch_business_data")
    @patch("analyst_agent.analyze_query")
    def test_end_to_end_pipeline(
        self,
        mock_analyze,
        mock_fetch,
        mock_exec,
        mock_generate,
    ):
        mock_analyze.return_value = {
            "clarification_required": False,
            "domains": ["sales"],
            "period": {"start_date": "2026-03-01", "end_date": "2026-03-07"},
        }
        mock_fetch.return_value = {"orders": pd.DataFrame()}
        mock_exec.return_value = {"status": "ok", "current_period": {"sales": 500}}
        mock_generate.return_value = "Total sales for the week was 500."

        res = ask_business_analyst(
            question="What was my sales last week?",
            brand_id="brand-123",
            run_analyst_llm=True,
        )

        assert res["question"] == "What was my sales last week?"
        assert res["bi_json"]["status"] == "ok"
        assert res["answer"] == "Total sales for the week was 500."
        mock_fetch.assert_called_once_with(brand_id="brand-123")
