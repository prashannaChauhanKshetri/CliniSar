"""Tests for the production settings, which the rest of the suite does not load."""

import importlib
import sys

import pytest
from django.core.exceptions import ImproperlyConfigured


def load_prod_settings(monkeypatch, **env):
    """Import config.settings.prod freshly with the given environment variables."""
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    sys.modules.pop("config.settings.prod", None)
    sys.modules.pop("config.settings.base", None)
    module = importlib.import_module("config.settings.prod")
    sys.modules.pop("config.settings.prod", None)
    sys.modules.pop("config.settings.base", None)
    return module


def test_prod_refuses_to_start_without_a_secret_key(monkeypatch) -> None:
    monkeypatch.delenv("DJANGO_SECRET_KEY", raising=False)
    with pytest.raises(ImproperlyConfigured):
        load_prod_settings(monkeypatch)


def test_prod_stores_files_in_a_private_bucket_with_5_minute_links(monkeypatch) -> None:
    prod = load_prod_settings(
        monkeypatch, DJANGO_SECRET_KEY="x" * 50, AWS_STORAGE_BUCKET_NAME="clinic-files"
    )
    storage = prod.STORAGES["default"]
    assert storage["BACKEND"] == "storages.backends.s3.S3Storage"
    assert storage["OPTIONS"]["bucket_name"] == "clinic-files"
    assert storage["OPTIONS"]["querystring_auth"] is True
    assert storage["OPTIONS"]["querystring_expire"] == 300
    assert storage["OPTIONS"]["default_acl"] is None
    assert prod.DEBUG is False


def test_prod_trusts_nginx_for_https_and_forces_it(monkeypatch) -> None:
    prod = load_prod_settings(
        monkeypatch, DJANGO_SECRET_KEY="x" * 50, DJANGO_ALLOWED_HOSTS="api.clinic.example"
    )
    assert prod.SECURE_PROXY_SSL_HEADER == ("HTTP_X_FORWARDED_PROTO", "https")
    assert prod.SECURE_SSL_REDIRECT is True
    assert prod.SECURE_HSTS_SECONDS >= 60 * 60 * 24 * 365
    assert prod.CSRF_TRUSTED_ORIGINS == ["https://api.clinic.example"]
    assert prod.REFRESH_COOKIE_SECURE is True


def test_prod_rate_limits_are_shared_by_workers_and_see_the_real_client(monkeypatch) -> None:
    prod = load_prod_settings(monkeypatch, DJANGO_SECRET_KEY="x" * 50)
    assert prod.CACHES["default"]["BACKEND"].endswith("DatabaseCache")
    assert prod.REST_FRAMEWORK["NUM_PROXIES"] == 1
    # The shared settings (throttles, authentication...) are kept, not replaced.
    assert prod.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["login"] == "5/min"
