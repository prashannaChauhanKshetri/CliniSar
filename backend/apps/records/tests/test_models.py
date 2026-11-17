"""Tests for the database rules on prescriptions."""

import pytest
from django.db import IntegrityError

from apps.records.models import Prescription
from apps.records.tests.factories import PrescriptionFactory, PrescriptionItemFactory


@pytest.mark.django_db
def test_new_prescription_is_pending() -> None:
    prescription = PrescriptionFactory()
    assert prescription.status == Prescription.Status.PENDING
    assert prescription.dispensed_by is None
    assert prescription.dispensed_at is None


@pytest.mark.django_db
def test_appointment_can_have_only_one_prescription() -> None:
    prescription = PrescriptionFactory()
    with pytest.raises(IntegrityError):
        PrescriptionFactory(clinic=prescription.clinic, appointment=prescription.appointment)


@pytest.mark.django_db
def test_medicine_appears_once_per_prescription() -> None:
    item = PrescriptionItemFactory()
    with pytest.raises(IntegrityError):
        PrescriptionItemFactory(prescription=item.prescription, medicine=item.medicine)


@pytest.mark.django_db
def test_item_quantity_must_be_positive() -> None:
    with pytest.raises(IntegrityError):
        PrescriptionItemFactory(quantity=0)
