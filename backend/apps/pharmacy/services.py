"""Business rules for stock: purchases, adjustments and dispensing prescriptions.

Stock is held per batch. change_stock() is the ONLY function that changes a batch's
quantity: it locks the batch row, updates the quantity and writes the StockMovement
row, all in one transaction. So the quantity always equals the sum of its movements.
"""

import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.billing import services as billing
from apps.common.exceptions import Conflict
from apps.records.models import Prescription

from .models import Medicine, MedicineBatch, StockMovement

Reason = StockMovement.Reason

# A batch "expires soon" when its expiry date is within this many days.
EXPIRING_SOON_DAYS = 90


# ---------- the one place where stock changes ----------


@transaction.atomic
def change_stock(
    batch: MedicineBatch, *, change: int, reason: str, note: str, user: User
) -> StockMovement:
    """Add (positive) or remove (negative) units from one batch and record why."""
    if change == 0:
        raise ValidationError({"change": "The change cannot be zero."})
    locked = MedicineBatch.objects.select_for_update().get(pk=batch.pk)
    if locked.quantity + change < 0:
        raise ValidationError(
            {"change": f"Only {locked.quantity} units are left in batch {locked.batch_number}."}
        )
    locked.quantity += change
    locked.save(update_fields=["quantity", "updated_at"])
    return StockMovement.objects.create(
        clinic=locked.clinic,
        batch=locked,
        change=change,
        reason=reason,
        note=note,
        created_by=user,
    )


# ---------- purchase and adjustment ----------


@transaction.atomic
def record_purchase(
    medicine: Medicine,
    *,
    batch_number: str,
    expiry_date: datetime.date,
    quantity: int,
    user: User,
) -> MedicineBatch:
    """A new delivery: create the batch (empty) and add its units with a PURCHASE movement."""
    if expiry_date <= timezone.localdate():
        raise ValidationError({"expiry_date": "The expiry date must be in the future."})
    if quantity <= 0:
        raise ValidationError({"quantity": "Quantity must be at least 1."})
    if MedicineBatch.objects.filter(medicine=medicine, batch_number=batch_number).exists():
        raise ValidationError(
            {"batch_number": "This medicine already has a batch with this number."}
        )

    batch = MedicineBatch.objects.create(
        clinic=medicine.clinic,
        medicine=medicine,
        batch_number=batch_number,
        expiry_date=expiry_date,
        quantity=0,
    )
    change_stock(batch, change=quantity, reason=Reason.PURCHASE, note="Purchase", user=user)
    batch.refresh_from_db()
    return batch


def adjust_stock(batch: MedicineBatch, *, change: int, note: str, user: User) -> StockMovement:
    """Correct a batch by hand (count mismatch, damage, writing off an expired batch)."""
    if not note.strip():
        raise ValidationError({"note": "Explain why the stock is adjusted."})
    return change_stock(batch, change=change, reason=Reason.ADJUSTMENT, note=note, user=user)


# ---------- dispensing ----------


def lock_usable_batches(medicine: Medicine) -> list[MedicineBatch]:
    """The medicine's batches that may be dispensed, locked, first-expiring first.

    Expired batches (expiry_date before today) are never dispensed.
    """
    return list(
        MedicineBatch.objects.select_for_update()
        .filter(medicine=medicine, quantity__gt=0, expiry_date__gte=timezone.localdate())
        .order_by("expiry_date", "created_at")
    )


def take_from_batches(item, batches: list[MedicineBatch], user: User, note: str) -> None:
    """Take item.quantity units, starting with the earliest-expiring batch.

    If that batch runs out, continue into the next one: one DISPENSE movement per
    batch used.
    """
    still_needed = item.quantity
    for batch in batches:
        if still_needed == 0:
            break
        taken = min(still_needed, batch.quantity)
        change_stock(batch, change=-taken, reason=Reason.DISPENSE, note=note, user=user)
        still_needed -= taken


@transaction.atomic
def dispense_prescription(prescription: Prescription, *, user: User) -> Prescription:
    """Hand over every medicine of a PENDING prescription, then bill it.

    Everything happens in one transaction: if any medicine is short, a 409 names it
    and the rollback undoes the stock already taken for earlier items, so nothing
    changes at all.
    """
    locked = Prescription.objects.select_for_update().get(pk=prescription.pk)
    if locked.status != Prescription.Status.PENDING:
        raise ValidationError({"status": "This prescription has already been dispensed."})

    items = list(locked.items.select_related("medicine").order_by("created_at"))
    note = f"Prescription of {locked.appointment.patient.full_name}"
    for item in items:
        batches = lock_usable_batches(item.medicine)
        available = sum(batch.quantity for batch in batches)
        if item.quantity > available:
            raise Conflict(
                f"Not enough {item.medicine}: {item.quantity} needed, {available} in stock."
            )
        take_from_batches(item, batches, user, note)

    locked.status = Prescription.Status.DISPENSED
    locked.dispensed_by = user
    locked.dispensed_at = timezone.now()
    locked.save(update_fields=["status", "dispensed_by", "dispensed_at", "updated_at"])
    create_pharmacy_invoice(locked, items)
    return locked


def create_pharmacy_invoice(prescription: Prescription, items: list) -> None:
    """One line per medicine: quantity x the medicine's current unit price."""
    lines = [
        billing.Line(
            description=str(item.medicine),
            quantity=item.quantity,
            unit_price=item.medicine.unit_price,
        )
        for item in items
    ]
    billing.create_invoice(
        clinic=prescription.clinic,
        patient=prescription.appointment.patient,
        source=billing.Source.PHARMACY,
        lines=lines,
        prescription=prescription,
    )
