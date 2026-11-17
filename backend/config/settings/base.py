"""Settings shared by development and production.

Every value that differs between machines is read from an environment variable,
so no secret is ever written in the code. See .env.example for the full list.
"""

import os
from datetime import timedelta
from pathlib import Path

# backend/ folder (this file is backend/config/settings/base.py).
BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env_list(name: str) -> list[str]:
    """Read a comma-separated environment variable as a list, e.g. "a.com,b.com"."""
    value = os.environ.get(name, "")
    return [item.strip() for item in value.split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    # Remembers used and logged-out refresh tokens so they cannot be used again.
    "rest_framework_simplejwt.token_blacklist",
]

LOCAL_APPS = [
    "apps.common",
    "apps.clinics",
    "apps.accounts",
    "apps.scheduling",
    "apps.records",
    "apps.pharmacy",
    "apps.lab",
    "apps.billing",
    "apps.dashboard",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    # First, so it times the whole request and tags every response.
    "apps.common.middleware.RequestLogMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Templates are only needed by the Django admin site and the API docs page.
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "clinisar"),
        "USER": os.environ.get("POSTGRES_USER", "clinisar"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

# The project uses its own User model (login by email, with a role and a clinic).
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Timestamps are stored in UTC (USE_TZ). "Today" and "now" mean Nepal time.
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kathmandu"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Which front-end addresses the browser allows to call this API.
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True
# Lets the front end read the request id of a failed call, to show in error messages.
CORS_EXPOSE_HEADERS = ["X-Request-ID"]

REST_FRAMEWORK = {
    # Every request proves who it is with a JWT access token in the Authorization header.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    # Used by LoginRateThrottle: at most 5 login attempts per minute from one IP address.
    "DEFAULT_THROTTLE_RATES": {"login": "5/min"},
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "CliniSar API",
    "DESCRIPTION": "Multi-tenant clinic management system for clinics in Nepal.",
    "VERSION": "1.0.0",
}

SIMPLE_JWT = {
    # Short-lived token sent with every request; kept only in the browser's memory.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    # Long-lived token kept in an httpOnly cookie; only used to get a new access token.
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    # Each refresh returns a NEW refresh token and blacklists the old one, so a stolen
    # refresh token stops working as soon as the real user refreshes.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# The cookie that carries the refresh token. JavaScript cannot read it (httpOnly) and
# the browser only sends it to the auth endpoints (path) of the same site (Strict).
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = True  # HTTPS only; dev.py turns this off for http://localhost

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "{asctime} {levelname} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
