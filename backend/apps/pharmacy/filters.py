"""Query-string filters for medicines and batches."""

import datetime

import django_filters
from django.db.models import F
from django.utils import timezone

from .models import Medicine, MedicineBatch


class MedicineFilter(django_filters.FilterSet):
    """?low_stock=true: medicines whose available stock is at or below the reorder level."""

    low_stock = django_filters.BooleanFilter(method="filter_low_stock")

    class Meta:
        model = Medicine
        fields = ["form"]

    def filter_low_stock(self, queryset, name, value):
        low = queryset.filter(available_stock__lte=F("reorder_level"))
        return low if value else queryset.exclude(pk__in=low.values("pk"))


class BatchFilter(django_filters.FilterSet):
    """?expiring_within=<days> and ?expired=true. Both show only batches with stock left."""

    expiring_within = django_filters.NumberFilter(method="filter_expiring_within", min_value=0)
    expired = django_filters.BooleanFilter(method="filter_expired")

    class Meta:
        model = MedicineBatch
        fields = ["medicine"]

    def filter_expiring_within(self, queryset, name, days):
        today = timezone.localdate()
        last_day = today + datetime.timedelta(days=int(days))
        return queryset.filter(quantity__gt=0, expiry_date__gte=today, expiry_date__lte=last_day)

    def filter_expired(self, queryset, name, value):
        today = timezone.localdate()
        if value:
            return queryset.filter(quantity__gt=0, expiry_date__lt=today)
        return queryset.filter(expiry_date__gte=today)
