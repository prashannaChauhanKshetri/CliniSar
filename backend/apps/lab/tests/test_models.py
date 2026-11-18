"""Tests for the lab models' database rules."""

import pytest
from django.db import IntegrityError

from apps.lab.models import LabOrder, LabOrderItem
from apps.lab.tests.factories import LabOrderFactory, LabTestFactory


@pytest.mark.django_db
def test_new_lab_order_is_ordered_with_one_test() -> None:
    order = LabOrderFactory()
    assert order.status == LabOrder.Status.ORDERED
    assert order.items.count() == 1
    assert order.patient == order.appointment.patient
    assert not order.file


@pytest.mark.django_db
def test_self_referred_order_has_no_visit() -> None:
    order = LabOrderFactory(appointment=None)
    assert order.appointment is None
    assert order.patient.clinic == order.clinic


@pytest.mark.django_db
def test_lab_test_name_is_unique_inside_one_clinic() -> None:
    lab_test = LabTestFactory(name="CBC")
    LabTestFactory(name="CBC")  # another clinic may use the same name
    with pytest.raises(IntegrityError):
        LabTestFactory(clinic=lab_test.clinic, name="CBC")


@pytest.mark.django_db
def test_lab_number_is_unique_inside_one_clinic() -> None:
    order = LabOrderFactory(lab_number=7)
    with pytest.raises(IntegrityError):
        LabOrderFactory(clinic=order.clinic, lab_number=7)


@pytest.mark.django_db
def test_a_test_appears_once_per_order() -> None:
    order = LabOrderFactory()
    with pytest.raises(IntegrityError):
        LabOrderItem.objects.create(order=order, lab_test=order.items.get().lab_test)


@pytest.mark.django_db
def test_parameters_keep_their_order() -> None:
    lab_test = LabTestFactory(parameters=[("B", "", ""), ("A", "", ""), ("C", "", "")])
    assert list(lab_test.parameters.values_list("name", flat=True)) == ["B", "A", "C"]
