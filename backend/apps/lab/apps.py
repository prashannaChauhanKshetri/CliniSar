from django.apps import AppConfig


class LabConfig(AppConfig):
    """Registers the lab app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.lab"
