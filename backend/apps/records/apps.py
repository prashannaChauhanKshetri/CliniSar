from django.apps import AppConfig


class RecordsConfig(AppConfig):
    """Registers the records app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.records"
