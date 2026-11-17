"""Admin screens for medicines, batches and the stock history."""

from django.contrib import admin

from .models import Medicine, MedicineBatch, StockMovement


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    """Medicines of every clinic."""

    list_display = ["name", "strength", "form", "unit_price", "reorder_level", "clinic"]
    list_filter = ["clinic"]
    search_fields = ["name", "generic_name"]


@admin.register(MedicineBatch)
class MedicineBatchAdmin(admin.ModelAdmin):
    """Batches. Quantity is read-only: it may only change through the stock service."""

    list_display = ["medicine", "batch_number", "expiry_date", "quantity", "clinic"]
    list_filter = ["clinic"]
    readonly_fields = ["quantity"]


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    """Stock history. It is view-only because movements are never edited or deleted."""

    list_display = ["created_at", "batch", "change", "reason", "created_by", "clinic"]
    list_filter = ["clinic", "reason"]

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
