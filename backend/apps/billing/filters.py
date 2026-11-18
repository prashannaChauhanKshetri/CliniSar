"""Query-string filters for the invoice list, e.g. ?status=UNPAID&source=LAB."""

import django_filters

from .models import Invoice


class InvoiceFilter(django_filters.FilterSet):
    """Filter by status, source, patient, number and the day the invoice was created."""

    created_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Invoice
        fields = ["status", "source", "series", "patient", "number"]
