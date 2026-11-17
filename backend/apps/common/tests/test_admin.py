"""Tests that the Django admin site (used by the super admin) works for every model."""

import pytest
from django.apps import apps
from django.contrib import admin
from django.urls import reverse

from apps.accounts.models import User

PROJECT_MODELS = [m for m in apps.get_models() if m.__module__.startswith("apps.")]


@pytest.fixture
def super_admin_client(client):
    """A browser session logged in to the admin site as the super admin."""
    user = User.objects.create_superuser("owner@example.com", "test-pass-123")
    client.force_login(user)
    return client


@pytest.mark.parametrize("model", PROJECT_MODELS, ids=lambda m: m.__name__)
def test_model_is_registered_in_admin(model) -> None:
    """The brief requires every model to be visible in the admin site."""
    assert model in admin.site._registry


@pytest.mark.django_db
@pytest.mark.parametrize("model", PROJECT_MODELS, ids=lambda m: m.__name__)
def test_admin_list_page_loads(super_admin_client, model) -> None:
    """Each model's list page opens without an error (catches typos in list_display)."""
    url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")
    assert super_admin_client.get(url).status_code == 200


@pytest.mark.django_db
def test_admin_add_user_page_loads(super_admin_client) -> None:
    """The page used to create a clinic's first CLINIC_ADMIN opens."""
    assert super_admin_client.get(reverse("admin:accounts_user_add")).status_code == 200
