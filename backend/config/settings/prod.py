"""Production settings: debug off, and the server refuses to start without a secret key."""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import SECRET_KEY

DEBUG = False

if not SECRET_KEY:
    raise ImproperlyConfigured("Set the DJANGO_SECRET_KEY environment variable.")

# Browsers must only send cookies over HTTPS.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
