"""Tests for the Clinic and Department models."""

from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.clinics.models import Clinic
from apps.clinics.tests.factories import ClinicFactory, DepartmentFactory


@pytest.mark.django_db
def test_clinic_defaults() -> None:
    """A new clinic starts with 80mm receipts, 13% VAT rate and VAT switched off."""
    clinic = ClinicFactory()
    assert clinic.receipt_width_mm == 80
    assert clinic.last_invoice_number == 0
    assert clinic.vat_rate == Decimal("13.00")
    assert not clinic.vat_on_consultation
    assert not clinic.vat_on_pharmacy
    assert not clinic.vat_on_lab
    assert clinic.is_active


@pytest.mark.django_db
def test_two_clinics_may_use_the_same_department_name() -> None:
    DepartmentFactory(name="Cardiology")
    DepartmentFactory(name="Cardiology")  # different clinic, so no error


@pytest.mark.django_db
def test_department_name_is_unique_inside_one_clinic() -> None:
    department = DepartmentFactory(name="Cardiology")
    with pytest.raises(IntegrityError):
        DepartmentFactory(clinic=department.clinic, name="Cardiology")


@pytest.mark.django_db
def test_saving_an_old_copy_of_the_clinic_keeps_the_invoice_counters() -> None:
    """A settings save must never roll back the invoice counters."""
    old_copy = ClinicFactory()
    Clinic.objects.filter(pk=old_copy.pk).update(last_invoice_number=7, last_lab_invoice_number=3)

    old_copy.name = "Renamed"
    old_copy.save()  # old_copy still holds 0 and 0 in memory

    fresh = Clinic.objects.get(pk=old_copy.pk)
    assert fresh.name == "Renamed"
    assert (fresh.last_invoice_number, fresh.last_lab_invoice_number) == (7, 3)
