"""Tests for the database rules on invoices."""

from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.billing.models import Invoice
from apps.billing.tests.factories import InvoiceFactory
from apps.lab.tests.factories import LabOrderFactory
from apps.records.tests.factories import PrescriptionFactory


@pytest.mark.django_db
def test_new_invoice_is_unpaid() -> None:
    invoice = InvoiceFactory()
    assert invoice.status == Invoice.Status.UNPAID
    assert invoice.payment_method is None
    assert invoice.paid_at is None


@pytest.mark.django_db
def test_invoice_can_point_to_a_prescription_or_a_lab_order() -> None:
    prescription = PrescriptionFactory()
    InvoiceFactory(
        clinic=prescription.clinic,
        appointment=None,
        prescription=prescription,
        patient=prescription.appointment.patient,
        source=Invoice.Source.PHARMACY,
    )
    lab_order = LabOrderFactory()
    InvoiceFactory(
        clinic=lab_order.clinic,
        appointment=None,
        lab_order=lab_order,
        patient=lab_order.patient,
        source=Invoice.Source.LAB,
    )
    assert Invoice.objects.count() == 2


@pytest.mark.django_db
def test_invoice_without_any_source_object_is_refused() -> None:
    prescription = PrescriptionFactory()
    with pytest.raises(IntegrityError):
        InvoiceFactory(
            clinic=prescription.clinic,
            appointment=None,
            patient=prescription.appointment.patient,
        )


@pytest.mark.django_db
def test_invoice_with_two_source_objects_is_refused() -> None:
    prescription = PrescriptionFactory()
    with pytest.raises(IntegrityError):
        InvoiceFactory(
            clinic=prescription.clinic,
            appointment=prescription.appointment,
            prescription=prescription,
            patient=prescription.appointment.patient,
        )


@pytest.mark.django_db
def test_discount_cannot_be_more_than_subtotal() -> None:
    with pytest.raises(IntegrityError):
        InvoiceFactory(subtotal=Decimal("500.00"), discount=Decimal("500.01"))


@pytest.mark.django_db
def test_same_invoice_number_is_allowed_in_different_clinics() -> None:
    InvoiceFactory(number=1)
    InvoiceFactory(number=1)
    assert Invoice.objects.filter(number=1).count() == 2


@pytest.mark.django_db
def test_invoice_number_is_unique_inside_one_clinic_and_series() -> None:
    invoice = InvoiceFactory(number=1)
    with pytest.raises(IntegrityError):
        InvoiceFactory(clinic=invoice.clinic, number=1)


@pytest.mark.django_db
def test_clinic_and_lab_series_may_both_have_number_1() -> None:
    invoice = InvoiceFactory(number=1)
    InvoiceFactory(clinic=invoice.clinic, number=1, series=Invoice.Series.LAB)


@pytest.mark.django_db
def test_discount_cannot_be_negative() -> None:
    with pytest.raises(IntegrityError):
        InvoiceFactory(discount=Decimal("-1.00"))
