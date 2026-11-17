"""Smoke tests: prove the project is configured correctly before any feature exists."""

import pytest
from django.conf import settings
from django.db import connection


def test_time_zone_is_nepal() -> None:
    """Slot and expiry rules depend on "today" meaning Asia/Kathmandu."""
    assert settings.TIME_ZONE == "Asia/Kathmandu"
    assert settings.USE_TZ is True


@pytest.mark.django_db
def test_database_is_postgresql() -> None:
    """The project relies on PostgreSQL features such as conditional unique constraints."""
    assert connection.vendor == "postgresql"


def test_api_docs_page_loads(client) -> None:
    """The drf-spectacular docs page must be reachable at /api/docs/."""
    response = client.get("/api/docs/")
    assert response.status_code == 200
