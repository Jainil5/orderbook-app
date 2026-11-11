import pytest

from backend.services import analytics


@pytest.fixture
def snapshot():
    return analytics.snapshot(days=3650)