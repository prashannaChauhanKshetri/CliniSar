"""The tenant itself (Clinic) and its departments."""

from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import BaseModel, TenantModel

# Changed only by the numbering services, under a row lock (billing and lab services).
COUNTER_FIELDS = {"last_invoice_number", "last_lab_invoice_number", "last_lab_order_number"}


class Clinic(BaseModel):
    """One independent clinic (a tenant). All clinic-owned data points back to this row."""

    class ReceiptWidth(models.IntegerChoices):
        MM_80 = 80, "80 mm"
        MM_58 = 58, "58 mm"

    name = models.CharField(max_length=200)
    # Printed in the footer of prescriptions, as on the clinic's paper pads.
    name_nepali = models.CharField(max_length=200, blank=True)
    slug = models.SlugField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    address_nepali = models.CharField(max_length=255, blank=True)
    # Free text printed at the bottom of every prescription,
    # e.g. "यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।" (valid for 15 days only).
    prescription_note = models.CharField(max_length=255, blank=True)
    pan_number = models.CharField(max_length=20, blank=True)
    # Paper width of the clinic's thermal receipt printer.
    receipt_width_mm = models.PositiveSmallIntegerField(
        choices=ReceiptWidth.choices, default=ReceiptWidth.MM_80
    )
    # Counter for invoice numbers; increased under a row lock when an invoice is created.
    last_invoice_number = models.PositiveIntegerField(default=0)
    # Some clinics run their lab as a separate business with its own name, PAN and
    # bill book. When lab_bills_separately is on, LAB invoices use these details and
    # their own number counter.
    lab_bills_separately = models.BooleanField(default=False)
    lab_name = models.CharField(max_length=200, blank=True)
    lab_pan_number = models.CharField(max_length=20, blank=True)
    last_lab_invoice_number = models.PositiveIntegerField(default=0)
    # Counter for the "Lab No." printed on lab reports.
    last_lab_order_number = models.PositiveIntegerField(default=0)
    # VAT is optional: one rate, switched on or off per kind of invoice.
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("13.00"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )
    vat_on_consultation = models.BooleanField(default=False)
    vat_on_pharmacy = models.BooleanField(default=False)
    vat_on_lab = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs) -> None:
        """Save every field except the number counters, unless they are named explicitly.

        Settings screens work on a copy of the clinic read a moment earlier. If an
        invoice was created in between, saving that copy would write the old counter
        back and the next invoice number would repeat. The invoice service always
        names the counter in update_fields, so only it can change the counters (the
        same goes for the Lab No. counter and the lab service).
        """
        if not self._state.adding and kwargs.get("update_fields") is None:
            kwargs["update_fields"] = [
                field.name
                for field in self._meta.concrete_fields
                if not field.primary_key and field.name not in COUNTER_FIELDS
            ]
        super().save(*args, **kwargs)


class Department(TenantModel):
    """A medical department of a clinic (e.g. Cardiology) that doctors belong to."""

    name = models.CharField(max_length=100)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "name"], name="unique_department_per_clinic"),
        ]

    def __str__(self) -> str:
        return self.name
