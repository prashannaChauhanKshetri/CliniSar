"""Rate limits for the authentication endpoints."""

from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Slows down password guessing: 5 login attempts per minute from one IP address.

    The rate itself ("5/min") is set in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].
    """

    scope = "login"
