"""Tests for the stock service: purchases, adjustments and dispensing."""

import datetime
from decimal import Decimal

import pytest
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.tests.factories import UserFactory
from apps.billing.models import Invoice
from apps.clinics.tests.factories import ClinicFactory
from apps.common.exceptions import Conflict
from apps.pharmacy import services
from apps.pharmacy.models import MedicineBatch, StockMovement
from apps.pharmacy.tests.factories import MedicineFactory
from apps.records.models import Prescription
from apps.records.tests.factories import PrescriptionFactory, PrescriptionItemFactory

pytestmark = pytest.mark.django_db


def in_days(days: int) -> datetime.date:
    return timezone.localdate() + datetime.timedelta(days=days)


@pytest.fixture
def pharmacist() -> User:
    """Whoever runs the pharmacy: since phase 12, the front desk & pharmacy role."""
    return UserFactory(role=User.Role.STAFF)


@pytest.fixture
def medicine(pharmacist):
    return MedicineFactory(clinic=pharmacist.clinic, name="Paracetamol", unit_price=Decimal("2.50"))


def buy(medicine, pharmacist, batch_number: str, quantity: int, expires_in: int):
    """Record a purchase through the service (expiry must be in the future)."""
    return services.record_purchase(
        medicine,
        batch_number=batch_number,
        expiry_date=in_days(expires_in),
        quantity=quantity,
        user=pharmacist,
    )


def add_expired_batch(medicine, batch_number: str, quantity: int, days_ago: int):
    """An expired batch with stock left. Purchases refuse past expiry dates, so the batch
    is made directly and filled through change_stock(), as a purchase long ago would be."""
    batch = MedicineBatch.objects.create(
        clinic=medicine.clinic,
        medicine=medicine,
        batch_number=batch_number,
        expiry_date=in_days(-days_ago),
        quantity=0,
    )
    services.change_stock(
        batch, change=quantity, reason="PURCHASE", note="Old purchase", user=UserFactory()
    )
    return batch


def quantities(medicine) -> dict[str, int]:
    return dict(medicine.batches.values_list("batch_number", "quantity"))


def movement_total(batch) -> int:
    return batch.movements.aggregate(total=Sum("change"))["total"] or 0


# ---------- purchase ----------


def test_purchase_creates_a_batch_and_a_purchase_movement(medicine, pharmacist) -> None:
    batch = buy(medicine, pharmacist, "B-001", 100, expires_in=365)

    assert batch.quantity == 100
    movement = batch.movements.get()
    assert (movement.change, movement.reason, movement.created_by) == (100, "PURCHASE", pharmacist)


@pytest.mark.parametrize("expires_in", [0, -1])
def test_purchase_expiry_must_be_in_the_future(medicine, pharmacist, expires_in) -> None:
    with pytest.raises(ValidationError):
        buy(medicine, pharmacist, "B-001", 10, expires_in=expires_in)
    assert not medicine.batches.exists()


def test_purchase_needs_a_positive_quantity(medicine, pharmacist) -> None:
    with pytest.raises(ValidationError):
        buy(medicine, pharmacist, "B-001", 0, expires_in=30)


def test_batch_number_must_be_new_for_that_medicine(medicine, pharmacist) -> None:
    buy(medicine, pharmacist, "B-001", 10, expires_in=30)
    with pytest.raises(ValidationError):
        buy(medicine, pharmacist, "B-001", 10, expires_in=60)


# ---------- adjustment ----------


def test_adjustment_up_and_down_with_a_note(medicine, pharmacist) -> None:
    batch = buy(medicine, pharmacist, "B-001", 50, expires_in=100)

    services.adjust_stock(batch, change=-5, note="Damaged strips", user=pharmacist)
    services.adjust_stock(batch, change=2, note="Found in store", user=pharmacist)

    batch.refresh_from_db()
    assert batch.quantity == 47
    assert list(batch.movements.order_by("created_at").values_list("reason", "change")) == [
        ("PURCHASE", 50),
        ("ADJUSTMENT", -5),
        ("ADJUSTMENT", 2),
    ]


def test_adjustment_needs_a_note(medicine, pharmacist) -> None:
    batch = buy(medicine, pharmacist, "B-001", 50, expires_in=100)
    with pytest.raises(ValidationError):
        services.adjust_stock(batch, change=-1, note="  ", user=pharmacist)


def test_zero_change_is_refused(medicine, pharmacist) -> None:
    batch = buy(medicine, pharmacist, "B-001", 50, expires_in=100)
    with pytest.raises(ValidationError):
        services.adjust_stock(batch, change=0, note="Nothing", user=pharmacist)


def test_batch_quantity_never_goes_negative(medicine, pharmacist) -> None:
    batch = buy(medicine, pharmacist, "B-001", 10, expires_in=100)

    with pytest.raises(ValidationError):
        services.adjust_stock(batch, change=-11, note="Too much", user=pharmacist)

    batch.refresh_from_db()
    assert batch.quantity == 10
    assert batch.movements.count() == 1  # only the purchase


def test_writing_off_an_expired_batch(medicine, pharmacist) -> None:
    expired = add_expired_batch(medicine, "OLD", 30, days_ago=10)
    services.adjust_stock(expired, change=-30, note="Expired, destroyed", user=pharmacist)
    expired.refresh_from_db()
    assert expired.quantity == 0


def test_quantity_always_equals_the_sum_of_movements(medicine, pharmacist) -> None:
    batch = buy(medicine, pharmacist, "B-001", 40, expires_in=100)
    services.adjust_stock(batch, change=-7, note="Count", user=pharmacist)
    services.change_stock(batch, change=-3, reason="DISPENSE", note="x", user=pharmacist)
    batch.refresh_from_db()
    assert batch.quantity == movement_total(batch) == 30


# ---------- dispensing ----------


def prescribe(medicine, quantity: int, prescription=None):
    """A PENDING prescription line for this medicine."""
    prescription = prescription or PrescriptionFactory(clinic=medicine.clinic)
    PrescriptionItemFactory(prescription=prescription, medicine=medicine, quantity=quantity)
    return prescription


def test_dispensing_takes_from_the_earliest_expiring_batch(medicine, pharmacist) -> None:
    buy(medicine, pharmacist, "LATE", 100, expires_in=300)
    buy(medicine, pharmacist, "EARLY", 100, expires_in=30)

    services.dispense_prescription(prescribe(medicine, 15), user=pharmacist)

    assert quantities(medicine) == {"EARLY": 85, "LATE": 100}


def test_dispensing_spills_into_the_next_batch(medicine, pharmacist) -> None:
    early = buy(medicine, pharmacist, "EARLY", 10, expires_in=30)
    late = buy(medicine, pharmacist, "LATE", 100, expires_in=300)

    services.dispense_prescription(prescribe(medicine, 15), user=pharmacist)

    assert quantities(medicine) == {"EARLY": 0, "LATE": 95}
    dispensed = StockMovement.objects.filter(reason="DISPENSE")
    assert sorted(dispensed.values_list("batch_id", "change")) == sorted(
        [(early.id, -10), (late.id, -5)]
    )


def test_expired_batches_are_never_dispensed(medicine, pharmacist) -> None:
    add_expired_batch(medicine, "EXPIRED", 100, days_ago=1)
    buy(medicine, pharmacist, "GOOD", 20, expires_in=200)

    services.dispense_prescription(prescribe(medicine, 15), user=pharmacist)

    assert quantities(medicine) == {"EXPIRED": 100, "GOOD": 5}


def test_a_batch_expiring_today_can_still_be_dispensed(medicine, pharmacist) -> None:
    batch = add_expired_batch(medicine, "TODAY", 10, days_ago=0)  # expiry date = today
    services.dispense_prescription(prescribe(medicine, 4), user=pharmacist)
    batch.refresh_from_db()
    assert batch.quantity == 6


def test_expired_stock_does_not_count_towards_enough(medicine, pharmacist) -> None:
    add_expired_batch(medicine, "EXPIRED", 100, days_ago=5)
    buy(medicine, pharmacist, "GOOD", 5, expires_in=200)

    with pytest.raises(Conflict):
        services.dispense_prescription(prescribe(medicine, 15), user=pharmacist)


def test_insufficient_stock_returns_409_naming_the_medicine_and_changes_nothing(
    medicine, pharmacist
) -> None:
    """The first medicine has enough, the second does not: nothing at all may change."""
    buy(medicine, pharmacist, "P-1", 100, expires_in=200)
    cough_syrup = MedicineFactory(clinic=medicine.clinic, name="Cough Syrup", strength="100ml")
    buy(cough_syrup, pharmacist, "C-1", 2, expires_in=200)
    prescription = prescribe(medicine, 15)
    prescribe(cough_syrup, 3, prescription)

    with pytest.raises(Conflict) as error:
        services.dispense_prescription(prescription, user=pharmacist)

    assert "Cough Syrup" in str(error.value.detail)
    assert quantities(medicine) == {"P-1": 100}  # the first item's stock was put back
    assert quantities(cough_syrup) == {"C-1": 2}
    assert not StockMovement.objects.filter(reason="DISPENSE").exists()
    prescription.refresh_from_db()
    assert prescription.status == Prescription.Status.PENDING
    assert not Invoice.objects.filter(prescription=prescription).exists()


def test_dispensing_marks_the_prescription_and_bills_it(medicine, pharmacist) -> None:
    buy(medicine, pharmacist, "P-1", 100, expires_in=200)
    prescription = prescribe(medicine, 15)

    services.dispense_prescription(prescription, user=pharmacist)

    prescription.refresh_from_db()
    assert prescription.status == Prescription.Status.DISPENSED
    assert prescription.dispensed_by == pharmacist
    assert prescription.dispensed_at is not None
    invoice = Invoice.objects.get(prescription=prescription)
    assert invoice.source == Invoice.Source.PHARMACY
    line = invoice.items.get()
    assert (line.description, line.quantity, line.unit_price, line.line_total) == (
        str(medicine),
        15,
        Decimal("2.50"),
        Decimal("37.50"),
    )


def test_pharmacy_invoice_uses_vat_when_switched_on(pharmacist) -> None:
    clinic = ClinicFactory(vat_rate=Decimal("13.00"), vat_on_pharmacy=True)
    pharmacist = UserFactory(clinic=clinic, role=User.Role.STAFF)
    medicine = MedicineFactory(clinic=clinic, unit_price=Decimal("100.00"))
    buy(medicine, pharmacist, "P-1", 10, expires_in=200)

    prescription = prescribe(medicine, 2)
    services.dispense_prescription(prescription, user=pharmacist)

    invoice = Invoice.objects.get(prescription=prescription)
    assert (invoice.subtotal, invoice.vat_amount, invoice.total) == (
        Decimal("200.00"),
        Decimal("26.00"),
        Decimal("226.00"),
    )


def test_a_prescription_is_dispensed_only_once(medicine, pharmacist) -> None:
    buy(medicine, pharmacist, "P-1", 100, expires_in=200)
    prescription = prescribe(medicine, 10)
    services.dispense_prescription(prescription, user=pharmacist)

    with pytest.raises(ValidationError):
        services.dispense_prescription(prescription, user=pharmacist)

    assert quantities(medicine) == {"P-1": 90}
    assert Invoice.objects.filter(prescription=prescription).count() == 1
