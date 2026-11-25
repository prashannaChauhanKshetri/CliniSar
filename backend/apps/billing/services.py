"""Business rules for invoices: maths, numbering, VAT, creation, payment and cancellation.

Invoices are never typed by hand. They are created by the system in the same
database transaction as the event they bill for (booking, dispensing, lab order).
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import PatientProfile, User
from apps.clinics.models import Clinic

from .models import Invoice, InvoiceItem

CENT = Decimal("0.01")
Source = Invoice.Source


def round_money(amount: Decimal) -> Decimal:
    """Round to paisa (2 decimals), with .5 always going up, as people expect on a bill."""
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


# ---------- maths ----------


@dataclass(frozen=True)
class Line:
    """One line to put on a new invoice."""

    description: str
    quantity: int
    unit_price: Decimal

    @property
    def line_total(self) -> Decimal:
        return round_money(self.unit_price * self.quantity)


@dataclass(frozen=True)
class Totals:
    """The calculated money fields of an invoice."""

    subtotal: Decimal
    vat_amount: Decimal
    total: Decimal


def calculate_totals(line_totals: list[Decimal], discount: Decimal, vat_rate: Decimal) -> Totals:
    """THE invoice maths, used both at creation and at payment (when a discount is given).

    subtotal   = sum of line totals
    taxable    = subtotal - discount
    vat_amount = taxable x vat_rate / 100, rounded half up to 2 decimals
    total      = taxable + vat_amount
    """
    subtotal = sum(line_totals, Decimal("0"))
    if discount < 0 or discount > subtotal:
        raise ValidationError({"discount": "Discount must be between 0 and the subtotal."})
    taxable = subtotal - discount
    vat_amount = round_money(taxable * vat_rate / 100)
    return Totals(subtotal=subtotal, vat_amount=vat_amount, total=taxable + vat_amount)


def vat_rate_for(clinic: Clinic, source: str) -> Decimal:
    """The clinic's VAT rate if VAT is switched on for this kind of invoice, else 0."""
    switch_is_on = {
        Source.CONSULTATION: clinic.vat_on_consultation,
        Source.PHARMACY: clinic.vat_on_pharmacy,
        Source.LAB: clinic.vat_on_lab,
    }[source]
    return clinic.vat_rate if switch_is_on else Decimal("0")


# ---------- numbering ----------


def take_next_number(clinic: Clinic, source: str) -> tuple[str, int, str, str]:
    """Lock the clinic row, increase the right counter and return the bill-book details.

    Returns (series, number, issuer_name, issuer_pan). The row lock makes two
    invoices created at the same moment wait for each other, so numbers never
    repeat or skip. The unique constraint on (clinic, series, number) is the backstop.
    Must be called inside a transaction.
    """
    locked = Clinic.objects.select_for_update().get(pk=clinic.pk)
    if source == Source.LAB and locked.lab_bills_separately:
        locked.last_lab_invoice_number += 1
        locked.save(update_fields=["last_lab_invoice_number", "updated_at"])
        name = locked.lab_name or locked.name
        return Invoice.Series.LAB, locked.last_lab_invoice_number, name, locked.lab_pan_number

    locked.last_invoice_number += 1
    locked.save(update_fields=["last_invoice_number", "updated_at"])
    return Invoice.Series.CLINIC, locked.last_invoice_number, locked.name, locked.pan_number


# ---------- creating ----------


@transaction.atomic
def create_invoice(
    *,
    clinic: Clinic,
    patient: PatientProfile,
    source: str,
    lines: list[Line],
    appointment=None,
    prescription=None,
    lab_order=None,
) -> Invoice:
    """Create an UNPAID invoice with its lines. Exactly one of the three links is given.

    Descriptions and prices are copied onto the lines, and the VAT rate onto the
    invoice, so later changes to prices or VAT settings never alter this invoice.
    """
    vat_rate = vat_rate_for(clinic, source)
    totals = calculate_totals([line.line_total for line in lines], Decimal("0"), vat_rate)
    series, number, issuer_name, issuer_pan = take_next_number(clinic, source)

    invoice = Invoice.objects.create(
        clinic=clinic,
        patient=patient,
        source=source,
        appointment=appointment,
        prescription=prescription,
        lab_order=lab_order,
        series=series,
        number=number,
        issuer_name=issuer_name,
        issuer_pan=issuer_pan,
        vat_rate=vat_rate,
        subtotal=totals.subtotal,
        vat_amount=totals.vat_amount,
        total=totals.total,
    )
    InvoiceItem.objects.bulk_create(
        InvoiceItem(
            invoice=invoice,
            description=line.description,
            quantity=line.quantity,
            unit_price=line.unit_price,
            line_total=line.line_total,
        )
        for line in lines
    )
    return invoice


def create_consultation_invoice(appointment) -> Invoice:
    """Bill a visit: one line at the doctor's consultation fee."""
    doctor = appointment.doctor
    line = Line(
        description=f"Consultation - Dr. {doctor.user.get_full_name()}",
        quantity=1,
        unit_price=doctor.consultation_fee,
    )
    return create_invoice(
        clinic=appointment.clinic,
        patient=appointment.patient,
        source=Source.CONSULTATION,
        lines=[line],
        appointment=appointment,
    )


# ---------- paying and cancelling ----------


def lock_unpaid_invoice(invoice: Invoice) -> Invoice:
    """Re-read the invoice with a row lock and check it can still be changed."""
    locked = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if locked.status != Invoice.Status.UNPAID:
        raise ValidationError(
            {"status": f"Only unpaid invoices can be changed; this one is {locked.status}."}
        )
    return locked


@transaction.atomic
def pay_invoice(
    invoice: Invoice, *, payment_method: str, received_by: User, discount: Decimal | None = None
) -> Invoice:
    """Take payment. An optional discount is applied first and the totals recalculated."""
    locked = lock_unpaid_invoice(invoice)
    if discount is not None:
        line_totals = list(locked.items.values_list("line_total", flat=True))
        totals = calculate_totals(line_totals, discount, locked.vat_rate)
        locked.discount = discount
        locked.vat_amount = totals.vat_amount
        locked.total = totals.total

    locked.status = Invoice.Status.PAID
    locked.payment_method = payment_method
    locked.paid_at = timezone.now()
    locked.received_by = received_by
    locked.save()
    return locked


@transaction.atomic
def cancel_invoice(invoice: Invoice, *, reason: str, cancelled_by: User | None = None) -> Invoice:
    """Cancel an UNPAID invoice. Paid invoices are locked: there are no refunds.

    `cancelled_by` is the person who pressed Cancel (None when a cancelled visit or lab
    order cancels its bill automatically). Anyone but the admin leaves the bill flagged
    for the admin's review.
    """
    locked = lock_unpaid_invoice(invoice)
    locked.status = Invoice.Status.CANCELLED
    locked.cancel_reason = reason
    locked.cancelled_by = cancelled_by
    locked.cancelled_at = timezone.now()
    # NP: Admin aafai le cancel garyo bhane review chaidaina; aru le garyo bhane admin lai khabar.
    locked.cancel_needs_review = (
        cancelled_by is not None and cancelled_by.role != User.Role.CLINIC_ADMIN
    )
    locked.save(
        update_fields=[
            "status",
            "cancel_reason",
            "cancelled_by",
            "cancelled_at",
            "cancel_needs_review",
            "updated_at",
        ]
    )
    return locked


def mark_cancel_reviewed(invoice: Invoice) -> Invoice:
    """The admin has seen a cancellation made by the front desk & pharmacy."""
    invoice.cancel_needs_review = False
    invoice.save(update_fields=["cancel_needs_review", "updated_at"])
    return invoice


@transaction.atomic
def cancel_unpaid_invoice_of(invoice: Invoice | None, *, reason: str) -> None:
    """When a visit or lab order is cancelled, cancel its bill too, but only if UNPAID.

    A paid bill stays paid (no refunds). The status is checked after locking the row,
    so a payment made a moment earlier is always seen.
    """
    if invoice is None:
        return
    locked = Invoice.objects.select_for_update().get(pk=invoice.pk)
    if locked.status == Invoice.Status.UNPAID:
        cancel_invoice(locked, reason=reason)
