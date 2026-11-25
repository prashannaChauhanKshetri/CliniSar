"""Billing: invoices created by the system for consultations, pharmacy sales and lab tests."""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.common.models import BaseModel, TenantModel, money_field


class Invoice(TenantModel):
    """A bill for exactly one event: an appointment, a dispensed prescription or a lab order."""

    class Source(models.TextChoices):
        CONSULTATION = "CONSULTATION", "Consultation"
        PHARMACY = "PHARMACY", "Pharmacy"
        LAB = "LAB", "Lab"

    class Status(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        WALLET = "WALLET", "Wallet"

    class Series(models.TextChoices):
        # The clinic's own bill book.
        CLINIC = "CLINIC", "Clinic"
        # The lab's separate bill book (only when Clinic.lab_bills_separately is on).
        LAB = "LAB", "Lab"

    series = models.CharField(max_length=10, choices=Series.choices, default=Series.CLINIC)
    # Sequential per clinic and series (1, 2, 3, ...), taken from the clinic's counter.
    number = models.PositiveIntegerField()
    # Who issued the bill, copied in at creation so later setting changes never alter it.
    issuer_name = models.CharField(max_length=200)
    issuer_pan = models.CharField(max_length=20, blank=True)
    patient = models.ForeignKey(
        "accounts.PatientProfile", on_delete=models.PROTECT, related_name="invoices"
    )
    source = models.CharField(max_length=15, choices=Source.choices)
    # Exactly one of the next three is set; it is the event this invoice bills for.
    appointment = models.OneToOneField(
        "scheduling.Appointment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice",
    )
    prescription = models.OneToOneField(
        "records.Prescription",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoice",
    )
    lab_order = models.OneToOneField(
        "lab.LabOrder", on_delete=models.PROTECT, null=True, blank=True, related_name="invoice"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.UNPAID)
    subtotal = money_field()
    discount = money_field(default=0)
    # Copied from the clinic when the invoice is created (0 when VAT is off for this
    # source), so later changes to the clinic's VAT settings never alter this invoice.
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    vat_amount = money_field()
    total = money_field()
    payment_method = models.CharField(
        max_length=10, choices=PaymentMethod.choices, null=True, blank=True
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoices_received",
    )
    cancel_reason = models.TextField(blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="invoices_cancelled",
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    # EN: The front desk & pharmacy may cancel a bill without asking, but the admin
    #     handles the money, so each such cancellation waits here until the admin has
    #     seen it (bell + dashboard). Bills cancelled by the admin, or automatically with
    #     a cancelled visit, do not need a review.
    # NP: Front desk le bill cancel garna paucha (admin sodhnu pardaina), tara admin lai
    #     tha huna paryo ni. Tesaile yo flag True huncha ra admin ko bell ma dekhincha,
    #     admin le "Seen" thichepachi False huncha.
    cancel_needs_review = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["clinic", "series", "number"], name="unique_invoice_number_per_series"
            ),
            models.CheckConstraint(
                condition=(
                    Q(appointment__isnull=False, prescription__isnull=True, lab_order__isnull=True)
                    | Q(
                        appointment__isnull=True, prescription__isnull=False, lab_order__isnull=True
                    )
                    | Q(
                        appointment__isnull=True, prescription__isnull=True, lab_order__isnull=False
                    )
                ),
                name="invoice_has_exactly_one_source_object",
            ),
            models.CheckConstraint(
                condition=Q(discount__lte=F("subtotal")), name="invoice_discount_not_above_subtotal"
            ),
            models.CheckConstraint(
                condition=Q(discount__gte=0), name="invoice_discount_not_negative"
            ),
        ]

    def __str__(self) -> str:
        return f"Invoice #{self.number}"


class InvoiceItem(BaseModel):
    """One line of an invoice. Description and price are copied in, so they never change later."""

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = money_field()
    line_total = money_field()

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.description} x {self.quantity}"
