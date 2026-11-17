"""Admin screens for prescriptions and documents."""

from django.contrib import admin

from .models import Document, Prescription, PrescriptionItem


class PrescriptionItemInline(admin.TabularInline):
    """Shows a prescription's medicine lines on the prescription page."""

    model = PrescriptionItem
    extra = 0


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    """Prescriptions of every clinic, with their items."""

    list_display = ["appointment", "status", "dispensed_at", "clinic"]
    list_filter = ["clinic", "status"]
    inlines = [PrescriptionItemInline]


@admin.register(PrescriptionItem)
class PrescriptionItemAdmin(admin.ModelAdmin):
    """Individual prescription lines."""

    list_display = ["prescription", "medicine", "quantity", "dosage", "frequency"]


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    """Uploaded patient documents."""

    list_display = ["title", "patient", "uploaded_by", "clinic", "created_at"]
    list_filter = ["clinic"]
