"""Tests for the role permission classes."""

from types import SimpleNamespace

import pytest
from django.conf import settings
from django.contrib.auth.models import AnonymousUser

from apps.accounts.models import User
from apps.common import permissions

Role = User.Role

# For each permission class: the roles it must allow. Every other role must be refused.
EXPECTED = {
    permissions.IsClinicAdmin: {Role.CLINIC_ADMIN},
    permissions.IsStaff: {Role.STAFF},
    permissions.IsDoctor: {Role.DOCTOR},
    permissions.IsPharmacist: {Role.PHARMACIST},
    permissions.IsLabTechnician: {Role.LAB_TECHNICIAN},
    permissions.IsAdminOrStaff: {Role.CLINIC_ADMIN, Role.STAFF},
}

CASES = [(permission, role) for permission in EXPECTED for role in Role]


def request_from(user) -> SimpleNamespace:
    """The only part of a request a permission class looks at is its user."""
    return SimpleNamespace(user=user)


@pytest.mark.parametrize(
    ("permission", "role"), CASES, ids=lambda value: getattr(value, "__name__", str(value))
)
def test_permission_allows_exactly_its_roles(permission, role) -> None:
    user = User(role=role)  # not saved: the check needs no database
    allowed = permission().has_permission(request_from(user), view=None)
    assert allowed == (role in EXPECTED[permission])


@pytest.mark.parametrize("permission", EXPECTED, ids=lambda p: p.__name__)
def test_permission_refuses_visitors_who_are_not_logged_in(permission) -> None:
    assert permission().has_permission(request_from(AnonymousUser()), view=None) is False


def test_endpoints_require_login_by_default() -> None:
    """A view that forgets to set permissions is still closed to the public."""
    assert settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] == [
        "rest_framework.permissions.IsAuthenticated"
    ]
