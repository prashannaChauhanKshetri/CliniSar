"""Production settings: debug off, and the server refuses to start without a secret key."""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import SECRET_KEY

DEBUG = False

if not SECRET_KEY:
    raise ImproperlyConfigured("Set the DJANGO_SECRET_KEY environment variable.")

# Browsers must only send cookies over HTTPS.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

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
