"""Query-string filters for the appointment list, e.g. ?date=2026-11-20&status=BOOKED."""

import django_filters

from .models import Appointment


class AppointmentFilter(django_filters.FilterSet):
    """Filter by day, date range, doctor, patient, status and visit type."""

    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = Appointment
        fields = ["date", "doctor", "patient", "status", "visit_type"]
