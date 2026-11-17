from django.apps import AppConfig


class ClinicsConfig(AppConfig):
    """Registers the clinics app with Django."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.clinics"
