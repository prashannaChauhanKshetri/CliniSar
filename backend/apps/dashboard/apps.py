from django.apps import AppConfig


class DashboardConfig(AppConfig):
    """Registers the dashboard app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.dashboard"
