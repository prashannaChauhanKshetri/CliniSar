"""Serializers for invoices. Money fields are always read-only: the server calculates them."""

from rest_framework import serializers

from .models import Invoice, InvoiceItem


class InvoiceItemSerializer(serializers.ModelSerializer):
    """One line of an invoice."""

    class Meta:
        model = InvoiceItem
        fields = ["id", "description", "quantity", "unit_price", "line_total"]


class InvoiceSerializer(serializers.ModelSerializer):
    """An invoice with its lines and the patient details printed on the bill."""

    items = InvoiceItemSerializer(many=True, read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_address = serializers.CharField(source="patient.address", read_only=True)
    patient_phone = serializers.CharField(source="patient.phone", read_only=True)
    received_by_name = serializers.CharField(
        source="received_by.get_full_name", read_only=True, allow_null=True
    )
    cancelled_by_name = serializers.CharField(
        source="cancelled_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = Invoice
        fields = [
            "id",
            "series",
            "number",
            "issuer_name",
            "issuer_pan",
            "source",
            "status",
            "patient",
            "patient_name",
            "patient_address",
            "patient_phone",
            "appointment",
            "prescription",
            "lab_order",
            "items",
            "subtotal",
            "discount",
            "vat_rate",
            "vat_amount",
            "total",
            "payment_method",
            "paid_at",
            "received_by",
            "received_by_name",
            "cancel_reason",
            "cancelled_by_name",
            "cancelled_at",
            "cancel_needs_review",
            "created_at",
        ]
        read_only_fields = fields


class PayInvoiceSerializer(serializers.Serializer):
    """Input of POST invoices/<id>/pay/. Only the method and an optional discount."""

    payment_method = serializers.ChoiceField(choices=Invoice.PaymentMethod.choices)
    discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, min_value=0
    )


class CancelInvoiceSerializer(serializers.Serializer):
    """Input of POST invoices/<id>/cancel/."""

    reason = serializers.CharField()
