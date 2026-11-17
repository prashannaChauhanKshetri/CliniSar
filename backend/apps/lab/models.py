"""Laboratory: the tests a clinic offers and the orders doctors place for patients."""

from django.conf import settings
from django.db import models

from apps.common.models import TenantModel, money_field


class LabTest(TenantModel):
    """A test the clinic's lab can perform, with its price and normal range."""

    name = models.CharField(max_length=200)
    price = money_field()
    unit = models.CharField(max_length=50, blank=True)
    normal_range = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "name"], name="unique_lab_test_per_clinic"),
        ]

    def __str__(self) -> str:
        return self.name


class LabOrder(TenantModel):
    """A request for one lab test for a patient, and later its result."""

    class Status(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        SAMPLE_COLLECTED = "SAMPLE_COLLECTED", "Sample collected"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Flag(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        ABNORMAL = "ABNORMAL", "Abnormal"

    patient = models.ForeignKey(
        "accounts.PatientProfile", on_delete=models.PROTECT, related_name="lab_orders"
    )
    appointment = models.ForeignKey(
        "scheduling.Appointment", on_delete=models.PROTECT, related_name="lab_orders"
    )
    lab_test = models.ForeignKey(LabTest, on_delete=models.PROTECT, related_name="orders")
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_orders_ordered"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ORDERED)
    result_value = models.TextField(blank=True)
    # Empty (null) until the result is entered.
    flag = models.CharField(max_length=10, choices=Flag.choices, null=True, blank=True)
    file = models.FileField(upload_to="lab_results/", blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="lab_orders_completed",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.lab_test} for {self.patient}"
