"""Test factories for lab tests (with parameters) and lab orders (with their tests)."""

from decimal import Decimal

import factory

from apps.accounts.models import User
from apps.accounts.tests.factories import PatientProfileFactory, UserFactory
from apps.clinics.tests.factories import ClinicFactory
from apps.lab.models import LabOrder, LabOrderItem, LabTest, LabTestParameter
from apps.scheduling.tests.factories import AppointmentFactory

DEFAULT_ROWS = [("Hemoglobin (Hb)", "gm%", "11-16"), ("ESR", "mm/hr", "0-20")]


class LabTestFactory(factory.django.DjangoModelFactory):
    """A lab test with two report rows; pass parameters=[(name, unit, range), ...] to change."""

    class Meta:
        model = LabTest
        skip_postgeneration_save = True

    clinic = factory.SubFactory(ClinicFactory)
    name = factory.Sequence(lambda n: f"Lab test {n}")
    price = Decimal("300.00")
    category = "HEMATOLOGY REPORT"

    @factory.post_generation
    def parameters(lab_test, create, rows, **kwargs):
        if not create:
            return
        for position, (name, unit, reference_range) in enumerate(rows or DEFAULT_ROWS):
            LabTestParameter.objects.create(
                lab_test=lab_test,
                name=name,
                unit=unit,
                reference_range=reference_range,
                position=position,
            )


class LabOrderFactory(factory.django.DjangoModelFactory):
    """An ORDERED lab order from a doctor's visit, containing one test.

    LabOrderFactory(appointment=None) makes a self-referred order;
    LabOrderFactory(tests=[a, b]) puts those tests in it.
    """

    class Meta:
        model = LabOrder
        skip_postgeneration_save = True

    clinic = factory.SubFactory(ClinicFactory)
    lab_number = factory.Sequence(lambda n: n + 1)
    appointment = factory.SubFactory(AppointmentFactory, clinic=factory.SelfAttribute("..clinic"))
    patient = factory.LazyAttribute(
        lambda order: (
            order.appointment.patient
            if order.appointment
            else PatientProfileFactory(clinic=order.clinic)
        )
    )
    ordered_by = factory.SubFactory(
        UserFactory, role=User.Role.DOCTOR, clinic=factory.SelfAttribute("..clinic")
    )

    @factory.post_generation
    def tests(order, create, tests, **kwargs):
        if not create:
            return
        for lab_test in tests if tests is not None else [LabTestFactory(clinic=order.clinic)]:
            LabOrderItem.objects.create(order=order, lab_test=lab_test)
