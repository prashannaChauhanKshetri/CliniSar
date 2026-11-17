"""Business rules for logging in, refreshing a session and logging out."""

from django.contrib.auth import authenticate
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


class SessionError(APIException):
    """A 401 answer for a failed login or an unusable refresh token."""

    status_code = 401
    default_detail = "Your session is not valid. Please log in again."
    default_code = "session_error"


def authenticate_user(email: str, password: str) -> User:
    """Return the user for these credentials, or raise a 401.

    The same message is used for a wrong email and a wrong password, so an attacker
    cannot find out which emails are registered.
    """
    user = authenticate(email=email.strip().lower(), password=password)
    if user is None:  # wrong email, wrong password or deactivated user
        raise SessionError("Incorrect email or password.")
    if user.role == User.Role.SUPER_ADMIN:
        raise SessionError("The super admin signs in on the admin site, not here.")
    if not user.clinic.is_active:
        raise SessionError("This clinic has been deactivated.")
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    """Create a fresh (access, refresh) token pair for a user who just logged in."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def rotate_tokens(refresh_token: str | None) -> tuple[str, str]:
    """Swap a valid refresh token for a new (access, refresh) pair.

    The old refresh token is blacklisted (see SIMPLE_JWT in settings), so each
    refresh token works exactly once.
    """
    if not refresh_token:
        raise SessionError()
    serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
    try:
        serializer.is_valid(raise_exception=True)
    except (TokenError, AuthenticationFailed) as error:  # expired, blacklisted, user gone
        raise SessionError() from error
    return serializer.validated_data["access"], serializer.validated_data["refresh"]


def revoke_refresh_token(refresh_token: str | None) -> None:
    """Blacklist a refresh token at logout. A missing or already-dead token is fine."""
    if not refresh_token:
        return
    try:
        RefreshToken(refresh_token).blacklist()
    except TokenError:
        pass
