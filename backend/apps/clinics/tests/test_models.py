"""Tests for the Clinic and Department models."""

from decimal import Decimal

import pytest
from django.db import IntegrityError

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
