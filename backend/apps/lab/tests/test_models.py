"""Tests for the lab models."""

import pytest
from django.db import IntegrityError

from apps.lab.models import LabOrder
from apps.lab.tests.factories import LabOrderFactory, LabTestFactory


@pytest.mark.django_db
def test_new_lab_order_is_ordered_with_no_result() -> None:
    order = LabOrderFactory()
    assert order.status == LabOrder.Status.ORDERED
    assert order.flag is None
    assert order.result_value == ""
    assert not order.file
    assert order.completed_by is None


@pytest.mark.django_db
def test_lab_test_name_is_unique_inside_one_clinic() -> None:
    lab_test = LabTestFactory(name="Haemoglobin")
    LabTestFactory(name="Haemoglobin")  # another clinic may use the same name
    with pytest.raises(IntegrityError):
        LabTestFactory(clinic=lab_test.clinic, name="Haemoglobin")
