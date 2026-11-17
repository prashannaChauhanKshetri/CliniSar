"""Tests for the authentication endpoints: login, refresh, logout, me, change-password."""

from datetime import timedelta

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.tests.factories import DEFAULT_PASSWORD, UserFactory
from apps.clinics.tests.factories import ClinicFactory

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
ME = "/api/v1/auth/me/"
CHANGE_PASSWORD = "/api/v1/auth/change-password/"

COOKIE = "refresh_token"

pytestmark = pytest.mark.django_db


def log_in(client: APIClient, user: User, password: str = DEFAULT_PASSWORD):
    """Call the real login endpoint."""
    return client.post(LOGIN, {"email": user.email, "password": password})


def use_access_token(client: APIClient, access: str) -> None:
    """Send the access token with later requests, as the front end does."""
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")


# ---------- settings ----------


def test_token_lifetimes_and_rotation() -> None:
    jwt = settings.SIMPLE_JWT
    assert jwt["ACCESS_TOKEN_LIFETIME"] == timedelta(minutes=15)
    assert jwt["REFRESH_TOKEN_LIFETIME"] == timedelta(days=7)
    assert jwt["ROTATE_REFRESH_TOKENS"] is True
    assert jwt["BLACKLIST_AFTER_ROTATION"] is True


# ---------- login ----------


def test_login_returns_access_token_and_user(api_client) -> None:
    user = UserFactory(role=User.Role.DOCTOR)

    response = log_in(api_client, user)

    assert response.status_code == 200
    assert response.data["access"]
    assert response.data["user"]["email"] == user.email
    assert response.data["user"]["role"] == "DOCTOR"
    assert response.data["user"]["clinic"]["slug"] == user.clinic.slug


def test_login_puts_refresh_token_only_in_a_protected_cookie(api_client, settings) -> None:
    settings.REFRESH_COOKIE_SECURE = True
    response = log_in(api_client, UserFactory())

    assert "refresh" not in response.data  # never in the JSON body
    cookie = response.cookies[COOKIE]
    assert cookie.value
    assert cookie["httponly"] is True
    assert cookie["secure"] is True
    assert cookie["samesite"] == "Strict"
    assert cookie["path"] == "/api/v1/auth/"
    assert cookie["max-age"] == 7 * 24 * 60 * 60


def test_login_email_is_not_case_sensitive(api_client) -> None:
    UserFactory(email="sita@example.com")
    response = api_client.post(LOGIN, {"email": "Sita@Example.com", "password": DEFAULT_PASSWORD})
    assert response.status_code == 200


def test_login_with_wrong_password_is_refused(api_client) -> None:
    response = log_in(api_client, UserFactory(), password="wrong-password")
    assert response.status_code == 401
    assert COOKIE not in response.cookies


def test_wrong_email_and_wrong_password_give_the_same_message(api_client) -> None:
    """Otherwise an attacker could discover which emails have an account."""
    wrong_password = log_in(api_client, UserFactory(), password="wrong-password")
    wrong_email = api_client.post(LOGIN, {"email": "nobody@example.com", "password": "x"})
    assert wrong_email.status_code == 401
    assert wrong_email.data == wrong_password.data


def test_deactivated_user_cannot_log_in(api_client) -> None:
    response = log_in(api_client, UserFactory(is_active=False))
    assert response.status_code == 401


def test_user_of_deactivated_clinic_cannot_log_in(api_client) -> None:
    user = UserFactory(clinic=ClinicFactory(is_active=False))
    assert log_in(api_client, user).status_code == 401


def test_super_admin_cannot_log_in_to_the_api(api_client) -> None:
    """The super admin works in the Django admin site only."""
    User.objects.create_superuser("owner@example.com", DEFAULT_PASSWORD)
    response = api_client.post(LOGIN, {"email": "owner@example.com", "password": DEFAULT_PASSWORD})
    assert response.status_code == 401


def test_login_is_limited_to_five_attempts_per_minute(api_client) -> None:
    user = UserFactory()
    for _ in range(5):
        assert log_in(api_client, user, password="wrong-password").status_code == 401
    # The sixth attempt is blocked even with the correct password.
    assert log_in(api_client, user).status_code == 429


# ---------- refresh ----------


def test_refresh_returns_a_new_access_token_and_a_new_cookie(api_client) -> None:
    user = UserFactory()
    old_cookie = log_in(api_client, user).cookies[COOKIE].value

    response = api_client.post(REFRESH)  # the client sends the cookie automatically

    assert response.status_code == 200
    assert response.cookies[COOKIE].value != old_cookie  # rotated
    use_access_token(api_client, response.data["access"])
    assert api_client.get(ME).data["email"] == user.email


def test_a_refresh_token_works_only_once(api_client) -> None:
    old_cookie = log_in(api_client, UserFactory()).cookies[COOKIE].value
    assert api_client.post(REFRESH).status_code == 200

    thief = APIClient()
    thief.cookies[COOKIE] = old_cookie
    assert thief.post(REFRESH).status_code == 401


def test_refresh_without_cookie_is_refused(api_client) -> None:
    assert api_client.post(REFRESH).status_code == 401


def test_refresh_with_a_bad_cookie_is_refused_and_clears_it(api_client) -> None:
    api_client.cookies[COOKIE] = "not-a-real-token"
    response = api_client.post(REFRESH)
    assert response.status_code == 401
    assert response.cookies[COOKIE].value == ""


def test_refresh_token_in_the_body_is_ignored(api_client) -> None:
    """Only the cookie counts, so a script that stole a token cannot use it here."""
    refresh = log_in(api_client, UserFactory()).cookies[COOKIE].value
    other = APIClient()
    assert other.post(REFRESH, {"refresh": refresh}).status_code == 401


# ---------- logout ----------


def test_logout_clears_the_cookie_and_kills_the_refresh_token(api_client) -> None:
    old_cookie = log_in(api_client, UserFactory()).cookies[COOKIE].value

    response = api_client.post(LOGOUT)

    assert response.status_code == 204
    assert response.cookies[COOKIE].value == ""
    # Even someone who copied the cookie before logout cannot use it.
    thief = APIClient()
    thief.cookies[COOKIE] = old_cookie
    assert thief.post(REFRESH).status_code == 401


def test_logout_without_a_session_still_succeeds(api_client) -> None:
    assert api_client.post(LOGOUT).status_code == 204


# ---------- me ----------


def test_me_requires_login(api_client) -> None:
    assert api_client.get(ME).status_code == 401


def test_me_rejects_a_made_up_token(api_client) -> None:
    use_access_token(api_client, "made-up-token")
    assert api_client.get(ME).status_code == 401


def test_me_returns_the_logged_in_user(api_client) -> None:
    user = UserFactory(first_name="Sita", last_name="Sharma")
    use_access_token(api_client, log_in(api_client, user).data["access"])

    response = api_client.get(ME)

    assert response.status_code == 200
    assert response.data["first_name"] == "Sita"
    assert "password" not in response.data


def test_me_lets_the_user_edit_name_and_phone(login_as) -> None:
    user = UserFactory()
    response = login_as(user).patch(ME, {"first_name": "Gita", "phone": "9800000000"})

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.first_name == "Gita"
    assert user.phone == "9800000000"


def test_me_cannot_change_role_email_or_clinic(login_as) -> None:
    user = UserFactory(role=User.Role.STAFF, email="staff@example.com")
    other_clinic = ClinicFactory()
    old_clinic = user.clinic

    response = login_as(user).patch(
        ME,
        {"role": "CLINIC_ADMIN", "email": "boss@example.com", "clinic": str(other_clinic.id)},
    )

    assert response.status_code == 200  # the forbidden fields are simply ignored
    user.refresh_from_db()
    assert user.role == User.Role.STAFF
    assert user.email == "staff@example.com"
    assert user.clinic == old_clinic


def test_me_cannot_be_replaced_or_deleted(login_as) -> None:
    client = login_as(UserFactory())
    assert client.put(ME, {}).status_code == 405
    assert client.delete(ME).status_code == 405


# ---------- change password ----------


def test_change_password_requires_login(api_client) -> None:
    assert api_client.post(CHANGE_PASSWORD, {}).status_code == 401


def test_change_password_needs_the_correct_current_password(login_as) -> None:
    user = UserFactory()
    response = login_as(user).post(
        CHANGE_PASSWORD, {"current_password": "wrong", "new_password": "a-new-pass-456"}
    )
    assert response.status_code == 400
    assert "current_password" in response.data
    user.refresh_from_db()
    assert user.check_password(DEFAULT_PASSWORD)


@pytest.mark.parametrize("weak_password", ["short1", "12345678", "password"])
def test_change_password_rejects_weak_passwords(login_as, weak_password) -> None:
    """Too short (under 8), only digits, or too common."""
    response = login_as(UserFactory()).post(
        CHANGE_PASSWORD, {"current_password": DEFAULT_PASSWORD, "new_password": weak_password}
    )
    assert response.status_code == 400
    assert "new_password" in response.data


def test_change_password_then_log_in_with_the_new_one(login_as, api_client) -> None:
    user = UserFactory()
    response = login_as(user).post(
        CHANGE_PASSWORD,
        {"current_password": DEFAULT_PASSWORD, "new_password": "a-new-pass-456"},
    )
    assert response.status_code == 204
    assert log_in(api_client, user).status_code == 401  # old password no longer works
    assert log_in(api_client, user, password="a-new-pass-456").status_code == 200
