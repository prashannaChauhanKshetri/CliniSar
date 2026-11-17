"""Admin screens for lab tests and lab orders."""

from django.contrib import admin

from .models import LabOrder, LabTest


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    """Lab tests offered by every clinic."""

    list_display = ["name", "price", "unit", "clinic"]
    list_filter = ["clinic"]
    search_fields = ["name"]


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    """Lab orders of every clinic."""

    list_display = ["lab_test", "patient", "status", "flag", "clinic", "created_at"]
    list_filter = ["clinic", "status"]
