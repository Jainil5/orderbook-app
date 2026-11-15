import pytest

from backend.services.route_models import analytics


@pytest.fixture
def snapshot():
    return analytics.snapshot(days=3650)