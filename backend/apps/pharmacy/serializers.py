"""Serializers for medicines, batches and stock movements."""

import datetime

from django.utils import timezone
from rest_framework import serializers

from .models import Medicine, MedicineBatch, StockMovement
from .services import EXPIRING_SOON_DAYS


class MedicineSerializer(serializers.ModelSerializer):
    """A medicine with its computed stock. There is no stock field to write."""

    # Filled by Medicine.objects.with_available_stock(); a new medicine has 0.
    available_stock = serializers.IntegerField(read_only=True, default=0)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = [
            "id",
            "name",
            "generic_name",
            "strength",
            "form",
            "unit_price",
            "reorder_level",
            "available_stock",
            "is_low_stock",
        ]
        extra_kwargs = {"unit_price": {"min_value": 0}}
        validators = []  # the unique check is done in validate() with a clear message

    def get_is_low_stock(self, medicine: Medicine) -> bool:
        return getattr(medicine, "available_stock", 0) <= medicine.reorder_level

    def validate(self, data: dict) -> dict:
        clinic = self.context["request"].user.clinic
        name = data.get("name", getattr(self.instance, "name", ""))
        strength = data.get("strength", getattr(self.instance, "strength", ""))
        same = Medicine.objects.filter(clinic=clinic, name__iexact=name, strength__iexact=strength)
        if self.instance:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError("This medicine and strength already exist.")
        return data


def expiry_status(expiry_date: datetime.date) -> str:
    """EXPIRED, EXPIRING_SOON (within 90 days) or OK, in Nepal time."""
    today = timezone.localdate()
    if expiry_date < today:
        return "EXPIRED"
    if expiry_date <= today + datetime.timedelta(days=EXPIRING_SOON_DAYS):
        return "EXPIRING_SOON"
    return "OK"


class MedicineBatchSerializer(serializers.ModelSerializer):
    """A batch as shown in lists (read only: batches change only through the services)."""

    medicine_name = serializers.CharField(source="medicine.__str__", read_only=True)
    expiry_status = serializers.SerializerMethodField()

    class Meta:
        model = MedicineBatch
        fields = [
            "id",
            "medicine",
            "medicine_name",
            "batch_number",
            "expiry_date",
            "expiry_status",
            "quantity",
            "created_at",
        ]
        read_only_fields = fields

    def get_expiry_status(self, batch: MedicineBatch) -> str:
        return expiry_status(batch.expiry_date)


class PurchaseSerializer(serializers.Serializer):
    """Input of POST medicines/<id>/batches/: a new delivery."""

    batch_number = serializers.CharField(max_length=50)
    expiry_date = serializers.DateField()
    quantity = serializers.IntegerField(min_value=1)


class AdjustmentSerializer(serializers.Serializer):
    """Input of POST batches/<id>/adjust/."""

    change = serializers.IntegerField()
    note = serializers.CharField(max_length=255)


class StockMovementSerializer(serializers.ModelSerializer):
    """One line of a medicine's stock history."""

    batch_number = serializers.CharField(source="batch.batch_number", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "batch",
            "batch_number",
            "change",
            "reason",
            "note",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = fields
