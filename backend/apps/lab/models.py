"""Laboratory: the tests a clinic offers (each a panel of parameters) and the orders for them.

Shaped after real lab report templates: a "Hematology" test has many rows (Hb, WBC,
...), each with its own unit and reference range, some under a sub-heading; a
"Serology" result is a word such as "Non-Reactive".
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import BaseModel, TenantModel, money_field
from apps.common.validators import validate_upload


class LabTest(TenantModel):
    """A test the lab offers, as billed (e.g. "CBC", "Lipid Profile", "RBS")."""

    name = models.CharField(max_length=200)
    price = money_field()
    # Heading the test is printed under, e.g. "HEMATOLOGY REPORT", "BIOCHEMICAL REPORT".
    category = models.CharField(max_length=100, blank=True)
    method = models.CharField(max_length=200, blank=True)  # e.g. "Fluorescence Immunoassay"
    specimen = models.CharField(max_length=100, blank=True)  # e.g. "Serum", "Whole Blood"
    # Printed under the results, e.g. how to read a Vitamin D value.
    interpretation = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "name"], name="unique_lab_test_per_clinic"),
        ]

    def __str__(self) -> str:
        return self.name


class LabTestParameter(BaseModel):
    """One row of a test's report: name, unit and reference range (e.g. Hb, gm%, 11-16)."""

    lab_test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name="parameters")
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=200, blank=True)
    # Optional sub-heading, e.g. "Differential Leucocyte Count" or "Microscopic Examination".
    section = models.CharField(max_length=100, blank=True)
    position = models.PositiveSmallIntegerField(default=0)  # order on the report

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"{self.lab_test}: {self.name}"


class LabOrder(TenantModel):
    """A request for one or more lab tests for a patient, with one Lab No. and one bill.

    It comes from a doctor's visit (appointment set) or from a patient who came to the
    lab on their own (appointment empty; the report says "Consultant: Self").
    """

    class Status(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        SAMPLE_COLLECTED = "SAMPLE_COLLECTED", "Sample collected"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    # "Lab No." printed on the report: 1, 2, 3 ... per clinic.
    lab_number = models.PositiveIntegerField()
    patient = models.ForeignKey(
        "accounts.PatientProfile", on_delete=models.PROTECT, related_name="lab_orders"
    )
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="lab_orders",
    )
    ordered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_orders_ordered"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ORDERED)
    collected_at = models.DateTimeField(null=True, blank=True)
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="lab_samples_collected",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="lab_orders_completed",
    )
    # Optional scan or machine print-out attached when the results are entered.
    file = models.FileField(upload_to="lab_results/", blank=True, validators=[validate_upload])
    cancel_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinic", "lab_number"], name="unique_lab_number_per_clinic"
            ),
        ]

    def __str__(self) -> str:
        return f"Lab No. {self.lab_number} for {self.patient}"


class LabOrderItem(BaseModel):
    """One test inside a lab order: the join table between LabOrder and LabTest."""

    order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name="items")
    lab_test = models.ForeignKey(LabTest, on_delete=models.PROTECT, related_name="order_items")

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["order", "lab_test"], name="unique_test_per_order"),
        ]

    def __str__(self) -> str:
        return f"{self.lab_test} in {self.order}"


class LabResult(BaseModel):
    """One result row of a completed test.

    Name, unit, reference range and section are copied from the parameter when the
    result is entered, so editing the test later never changes a finished report.
    """

    class Flag(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        ABNORMAL = "ABNORMAL", "Abnormal"

    item = models.ForeignKey(LabOrderItem, on_delete=models.CASCADE, related_name="results")
    parameter = models.ForeignKey(
        LabTestParameter, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=50, blank=True)
    reference_range = models.CharField(max_length=200, blank=True)
    section = models.CharField(max_length=100, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    value = models.CharField(max_length=200)  # text: "15.1", "Non-Reactive", "1-2/HPF"
    flag = models.CharField(max_length=10, choices=Flag.choices)

    class Meta:
        ordering = ["position", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["item", "parameter"],
                condition=Q(parameter__isnull=False),
                name="unique_result_per_parameter",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name}: {self.value} {self.unit}".strip()
