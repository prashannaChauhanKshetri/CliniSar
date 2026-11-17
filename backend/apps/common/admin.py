"""Admin screen for the audit log (read by the super admin when investigating)."""

from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Lists audit entries; they are history, so the admin cannot add or edit them."""

    list_display = ["created_at", "clinic", "user", "action", "model_name", "object_id"]
    list_filter = ["clinic", "action", "model_name"]

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
