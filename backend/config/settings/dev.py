"""Development settings: debug on, safe defaults so the project runs without setup."""

import os

from .base import *  # noqa: F403

DEBUG = True
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-key-never-use-in-production")
ALLOWED_HOSTS = ["*"]
CORS_ALLOWED_ORIGINS = ["http://localhost:5173"]
