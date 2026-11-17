"""Pharmacy stock: medicines, their batches (with expiry) and the history of stock changes."""

from django.conf import settings
from django.db import models
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.common.models import TenantModel, money_field


class MedicineQuerySet(models.QuerySet):
    """Adds the computed stock number to medicine queries."""

    def with_available_stock(self) -> MedicineQuerySet:
        """Annotate each medicine with available_stock: units in batches not yet expired.

        Done in the database as one query, so a list of medicines does not run one
        extra query per row. "Today" is the date in Asia/Kathmandu (settings.TIME_ZONE).
        """
        today = timezone.localdate()
        unexpired = Q(batches__expiry_date__gte=today)
        return self.annotate(
            available_stock=Coalesce(Sum("batches__quantity", filter=unexpired), 0)
        )


class Medicine(TenantModel):
    """A medicine the clinic sells. It stores no stock number; stock lives in its batches."""

    name = models.CharField(max_length=200)
    generic_name = models.CharField(max_length=200, blank=True)
    strength = models.CharField(max_length=50, blank=True)
    form = models.CharField(max_length=50, blank=True)
    unit_price = money_field()
    # A medicine is "low stock" when available stock is at or below this number.
    reorder_level = models.PositiveIntegerField(default=0)

    objects = MedicineQuerySet.as_manager()

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinic", "name", "strength"], name="unique_medicine_per_clinic"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} {self.strength}".strip()


class MedicineBatch(TenantModel):
    """One purchased lot of a medicine with its own expiry date and remaining quantity."""

    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name="batches")
    batch_number = models.CharField(max_length=50)
    expiry_date = models.DateField()
    # Units left in this batch. Only the stock service may change it (phase 6).
    quantity = models.IntegerField(default=0)

    class Meta:
        ordering = ["expiry_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["medicine", "batch_number"], name="unique_batch_per_medicine"
            ),
            # Last line of defence: the database refuses negative stock.
            models.CheckConstraint(
                condition=Q(quantity__gte=0), name="batch_quantity_not_negative"
            ),
        ]
        indexes = [
            # Dispensing looks up a medicine's batches ordered by expiry date.
            models.Index(fields=["medicine", "expiry_date"], name="batch_medicine_expiry_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.medicine} batch {self.batch_number}"


class StockMovement(TenantModel):
    """One change to a batch's quantity. Rows are a permanent history: never edited or deleted."""

    class Reason(models.TextChoices):
        PURCHASE = "PURCHASE", "Purchase"
        DISPENSE = "DISPENSE", "Dispense"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"

    batch = models.ForeignKey(MedicineBatch, on_delete=models.PROTECT, related_name="movements")
    # Positive adds stock, negative removes it.
    change = models.IntegerField()
    reason = models.CharField(max_length=10, choices=Reason.choices)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="stock_movements"
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=~Q(change=0), name="stock_movement_change_not_zero"),
        ]

    def __str__(self) -> str:
        return f"{self.reason} {self.change:+d} on {self.batch}"

    def save(self, *args, **kwargs) -> None:
        """Allow inserting a new movement but refuse to change an existing one."""
        if not self._state.adding:
            raise ValueError("Stock movements cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Refuse deletion so the stock history stays complete."""
        raise ValueError("Stock movements cannot be deleted.")
