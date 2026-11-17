"""pytest settings shared by every back-end test."""

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def temporary_media_folder(settings, tmp_path) -> None:
    """Send files uploaded during tests to a throwaway folder instead of backend/media."""
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture(autouse=True)
def clear_cache() -> None:
    """Reset the login rate-limit counters, so one test cannot use up another's attempts."""
    cache.clear()


@pytest.fixture
def api_client() -> APIClient:
    """A client that is not logged in."""
    return APIClient()


@pytest.fixture
def login_as():
    """Return a function that gives a client logged in as the given user.

    It skips the login endpoint and attaches the user directly, which keeps tests of
    other endpoints short and fast.
    """

    def make_client(user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return make_client
