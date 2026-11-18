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
