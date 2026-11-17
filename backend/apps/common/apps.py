from django.apps import AppConfig


class CommonConfig(AppConfig):
    """Registers the common app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"
