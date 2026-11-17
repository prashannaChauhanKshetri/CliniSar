"""Admin screens the super admin uses to create clinics and departments."""

from django.contrib import admin

from .models import Clinic, Department


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    """Create and edit clinics. The invoice counter is shown but cannot be edited."""

    list_display = ["name", "slug", "phone", "vat_rate", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ["name"]}
    readonly_fields = ["last_invoice_number"]


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    """Departments of every clinic."""

    list_display = ["name", "clinic"]
    list_filter = ["clinic"]
    search_fields = ["name"]
