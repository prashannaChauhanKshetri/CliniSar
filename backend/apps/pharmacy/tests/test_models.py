"""Tests for the database rules on stock and for the available_stock calculation."""

import datetime

import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.pharmacy.models import Medicine
from apps.pharmacy.tests.factories import (
    MedicineBatchFactory,
    MedicineFactory,
    StockMovementFactory,
)


def days_from_today(days: int) -> datetime.date:
    """A date relative to today in Nepal time."""
    return timezone.localdate() + datetime.timedelta(days=days)


def add_batch(medicine: Medicine, quantity: int, expires_in_days: int) -> None:
    """Give a medicine one more batch."""
    MedicineBatchFactory(
        clinic=medicine.clinic,
        medicine=medicine,
        quantity=quantity,
        expiry_date=days_from_today(expires_in_days),
    )


@pytest.mark.django_db
def test_batch_quantity_cannot_be_negative() -> None:
    with pytest.raises(IntegrityError):
        MedicineBatchFactory(quantity=-1)


@pytest.mark.django_db
def test_batch_number_is_unique_per_medicine() -> None:
    batch = MedicineBatchFactory()
    with pytest.raises(IntegrityError):
        MedicineBatchFactory(
            clinic=batch.clinic, medicine=batch.medicine, batch_number=batch.batch_number
        )


@pytest.mark.django_db
def test_stock_movement_change_cannot_be_zero() -> None:
    with pytest.raises(IntegrityError):
        StockMovementFactory(change=0)


@pytest.mark.django_db
def test_stock_movement_cannot_be_edited_or_deleted() -> None:
    movement = StockMovementFactory()
    movement.change = 5
    with pytest.raises(ValueError):
        movement.save()
    with pytest.raises(ValueError):
        movement.delete()


@pytest.mark.django_db
def test_available_stock_adds_up_unexpired_batches() -> None:
    medicine = MedicineFactory()
    add_batch(medicine, quantity=30, expires_in_days=10)
    add_batch(medicine, quantity=20, expires_in_days=400)

    found = Medicine.objects.with_available_stock().get(id=medicine.id)
    assert found.available_stock == 50


@pytest.mark.django_db
def test_available_stock_ignores_expired_batches() -> None:
    medicine = MedicineFactory()
    add_batch(medicine, quantity=30, expires_in_days=-1)  # expired yesterday
    add_batch(medicine, quantity=7, expires_in_days=0)  # expires today: still usable

    found = Medicine.objects.with_available_stock().get(id=medicine.id)
    assert found.available_stock == 7


@pytest.mark.django_db
def test_available_stock_is_zero_without_batches() -> None:
    medicine = MedicineFactory()
    found = Medicine.objects.with_available_stock().get(id=medicine.id)
    assert found.available_stock == 0


@pytest.mark.django_db
def test_available_stock_uses_one_query_for_a_whole_list(django_assert_num_queries) -> None:
    """The annotation must not run one extra query per medicine."""
    for _ in range(3):
        add_batch(MedicineFactory(), quantity=5, expires_in_days=30)

    with django_assert_num_queries(1):
        stocks = [m.available_stock for m in Medicine.objects.with_available_stock()]
    assert stocks == [5, 5, 5]
