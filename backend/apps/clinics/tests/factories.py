"""Test factories: build valid Clinic and Department rows with one line in a test."""

import factory

from apps.clinics.models import Clinic, Department


class ClinicFactory(factory.django.DjangoModelFactory):
    """A clinic with a unique name and slug."""

    class Meta:
        model = Clinic

    name = factory.Sequence(lambda n: f"Clinic {n}")
    slug = factory.Sequence(lambda n: f"clinic-{n}")
    phone = "01-4000000"
    address = "Kathmandu"
    pan_number = "600000000"


class DepartmentFactory(factory.django.DjangoModelFactory):
    """A department inside a clinic."""

    class Meta:
        model = Department

    clinic = factory.SubFactory(ClinicFactory)
    name = factory.Sequence(lambda n: f"Department {n}")
