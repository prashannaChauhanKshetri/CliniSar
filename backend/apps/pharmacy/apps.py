from django.apps import AppConfig


class PharmacyConfig(AppConfig):
    """Registers the pharmacy app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.pharmacy"
