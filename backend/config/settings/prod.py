"""Production settings: debug off, and the server refuses to start without a secret key."""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import ALLOWED_HOSTS, REST_FRAMEWORK, SECRET_KEY

DEBUG = False

if not SECRET_KEY:
    raise ImproperlyConfigured("Set the DJANGO_SECRET_KEY environment variable.")

# Browsers must only send cookies over HTTPS.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# ---------- HTTPS behind nginx ----------
# nginx ends the HTTPS connection and passes the request on over plain HTTP inside the
# server, adding "X-Forwarded-Proto: https". This header tells Django the original
# request was secure (nginx always sets it, so a client cannot fake it).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Anything that still arrives over plain HTTP is sent to HTTPS.
SECURE_SSL_REDIRECT = True
# HSTS: browsers remember for a year to use only HTTPS for the API, so a fake
# "http://" link on a public Wi-Fi cannot downgrade the connection.
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
# Not "preload": that puts the whole domain on the browsers' built-in HTTPS-only list,
# which takes months to undo. It is the domain owner's decision, so Django's reminder
# about it is switched off.
SILENCED_SYSTEM_CHECKS = ["security.W021"]
# The Django admin's forms (super admin only) post back to the API's own address.
CSRF_TRUSTED_ORIGINS = [f"https://{host}" for host in ALLOWED_HOSTS]
# Also on by default, written here so the list of protections is in one place:
SECURE_CONTENT_TYPE_NOSNIFF = True  # X-Content-Type-Options: nosniff
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"  # the API and admin can never be shown inside another site

# ---------- rate limits that every Gunicorn worker shares ----------
# Gunicorn runs several Django processes. With the default in-memory cache each one
# would count separately, so a limit of 5 would really be 5 per process. The database
# cache table (created by "manage.py createcachetable" on every deploy) is shared.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "clinisar_cache",
    }
}
# Every request reaches Django through exactly one proxy (nginx), which appends the
# real client address to X-Forwarded-For. Rate limits use that address; without this
# setting every visitor would look like nginx and share one limit.
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": 1}

# Uploaded files (documents, lab result scans) go to a PRIVATE S3 bucket. Nobody can
# open them by URL alone: the API returns pre-signed links that stop working after
# 5 minutes. AWS credentials come from the EC2 instance's IAM role, not from code.
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": os.environ.get("AWS_STORAGE_BUCKET_NAME", ""),
            "region_name": os.environ.get("AWS_S3_REGION_NAME", "ap-south-1"),
            "default_acl": None,  # keep the bucket's private setting
            "querystring_auth": True,  # pre-signed URLs
            "querystring_expire": 300,  # 5 minutes
            "file_overwrite": False,  # never replace a file that has the same name
        },
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
