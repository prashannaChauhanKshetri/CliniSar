"""Test factories for lab tests and lab orders."""

from decimal import Decimal

import factory

from apps.accounts.models import User
from apps.accounts.tests.factories import UserFactory
from apps.clinics.tests.factories import ClinicFactory
from apps.lab.models import LabOrder, LabTest
from apps.scheduling.tests.factories import AppointmentFactory


class LabTestFactory(factory.django.DjangoModelFactory):
    """A lab test with a unique name."""

    class Meta:
        model = LabTest

    clinic = factory.SubFactory(ClinicFactory)
    name = factory.Sequence(lambda n: f"Lab test {n}")
    price = Decimal("300.00")
    unit = "g/dL"
    normal_range = "12 - 16"


class LabOrderFactory(factory.django.DjangoModelFactory):
    """An ORDERED lab order; its patient is the appointment's patient."""

    class Meta:
        model = LabOrder

    clinic = factory.SubFactory(ClinicFactory)
    appointment = factory.SubFactory(AppointmentFactory, clinic=factory.SelfAttribute("..clinic"))
    patient = factory.SelfAttribute("appointment.patient")
    lab_test = factory.SubFactory(LabTestFactory, clinic=factory.SelfAttribute("..clinic"))
    ordered_by = factory.SubFactory(
        UserFactory, role=User.Role.DOCTOR, clinic=factory.SelfAttribute("..clinic")
    )
