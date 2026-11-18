"""Admin screens for lab tests (with their parameters) and lab orders (with their results)."""

from django.contrib import admin

from .models import LabOrder, LabOrderItem, LabResult, LabTest, LabTestParameter


class LabTestParameterInline(admin.TabularInline):
    """Edit a test's report rows on the test's page."""

    model = LabTestParameter
    extra = 0


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    """Lab tests offered by every clinic."""

    list_display = ["name", "category", "price", "is_active", "clinic"]
    list_filter = ["clinic", "category", "is_active"]
    search_fields = ["name"]
    inlines = [LabTestParameterInline]


@admin.register(LabTestParameter)
class LabTestParameterAdmin(admin.ModelAdmin):
    """Individual report rows."""

    list_display = ["lab_test", "position", "name", "unit", "reference_range", "section"]


class LabOrderItemInline(admin.TabularInline):
    """Shows which tests an order contains."""

    model = LabOrderItem
    extra = 0


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    """Lab orders of every clinic."""

    list_display = ["lab_number", "patient", "status", "clinic", "created_at"]
    list_filter = ["clinic", "status"]
    inlines = [LabOrderItemInline]


@admin.register(LabOrderItem)
class LabOrderItemAdmin(admin.ModelAdmin):
    """The tests inside orders."""

    list_display = ["order", "lab_test"]


@admin.register(LabResult)
class LabResultAdmin(admin.ModelAdmin):
    """Entered results (copies of the parameter details plus the value)."""

    list_display = ["item", "name", "value", "unit", "flag"]
