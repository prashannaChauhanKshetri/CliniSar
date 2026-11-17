from django.apps import AppConfig


class BillingConfig(AppConfig):
    """Registers the billing app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.billing"
