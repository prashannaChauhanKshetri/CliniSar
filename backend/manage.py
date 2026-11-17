#!/usr/bin/env python
"""Django's command-line tool (runserver, migrate, createsuperuser, ...)."""

import os
import sys


def main() -> None:
    """Run a Django management command, using development settings by default."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
