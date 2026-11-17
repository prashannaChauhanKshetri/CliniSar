"""Helpers that put the refresh token into its cookie and take it out again."""

from django.conf import settings
from rest_framework.response import Response


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Store the refresh token in a cookie that JavaScript cannot read."""
    lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=int(lifetime.total_seconds()),
        path=settings.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
    )


def clear_refresh_cookie(response: Response) -> None:
    """Remove the refresh cookie (path and SameSite must match the cookie that was set)."""
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite="Strict"
    )
