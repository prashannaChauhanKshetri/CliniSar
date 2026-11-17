"""Turns database errors that are really user mistakes into clear API answers."""

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context) -> Response | None:
    """DRF's normal error handling, plus a 409 when a delete is blocked by PROTECT.

    Example: deleting a patient who has appointments. Without this the user would
    see a 500 server error.
    """
    if isinstance(exc, ProtectedError):
        message = "This cannot be deleted because other records still refer to it."
        return Response({"detail": message}, status=status.HTTP_409_CONFLICT)
    return exception_handler(exc, context)
