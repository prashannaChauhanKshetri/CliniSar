"""Medical records: prescriptions with their medicine lines, and uploaded documents."""

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel, TenantModel
from apps.common.validators import validate_upload


class Prescription(TenantModel):
    """What a doctor prescribed at one appointment. Patient and doctor come from the appointment."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DISPENSED = "DISPENSED", "Dispensed"

    appointment = models.OneToOneField(
        "scheduling.Appointment", on_delete=models.PROTECT, related_name="prescription"
    )
    diagnosis = models.TextField()
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    dispensed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="prescriptions_dispensed",
    )
    dispensed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Prescription for {self.appointment.patient}"


class PrescriptionItem(BaseModel):
    """One medicine line of a prescription: the join table between Prescription and Medicine."""

    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="items")
    medicine = models.ForeignKey(
        "pharmacy.Medicine", on_delete=models.PROTECT, related_name="prescription_items"
    )
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100)
    duration_days = models.PositiveSmallIntegerField()
    # Number of units the pharmacist must hand over.
    quantity = models.PositiveIntegerField()
    instructions = models.TextField(blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["prescription", "medicine"], name="unique_medicine_per_prescription"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0), name="prescription_item_quantity_positive"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.medicine} x {self.quantity}"


class Document(TenantModel):
    """A file (report, scan, ...) uploaded for a patient."""

    patient = models.ForeignKey(
        "accounts.PatientProfile", on_delete=models.PROTECT, related_name="documents"
    )
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to="documents/", validators=[validate_upload])
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="documents_uploaded"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
