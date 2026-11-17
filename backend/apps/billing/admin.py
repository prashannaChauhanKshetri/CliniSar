"""Admin screens for invoices."""

from django.contrib import admin

from .models import Invoice, InvoiceItem


class InvoiceItemInline(admin.TabularInline):
    """Shows an invoice's lines on the invoice page."""

    model = InvoiceItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Invoices of every clinic, with their lines."""

    list_display = ["number", "clinic", "patient", "source", "status", "total", "paid_at"]
    list_filter = ["clinic", "source", "status"]
    inlines = [InvoiceItemInline]


@admin.register(InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    """Individual invoice lines."""

    list_display = ["invoice", "description", "quantity", "unit_price", "line_total"]
