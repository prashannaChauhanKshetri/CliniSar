"""Test factories for users, doctors and patients.

Each factory keeps every related object in the SAME clinic, which is what real data
looks like. Pass clinic=... to place the object in a specific clinic.
"""

from decimal import Decimal

import factory

from apps.accounts.models import DoctorProfile, PatientProfile, User
from apps.clinics.tests.factories import ClinicFactory, DepartmentFactory

DEFAULT_PASSWORD = "test-pass-123"


class UserFactory(factory.django.DjangoModelFactory):
    """A front-desk STAFF user by default; pass role=... for other roles."""

    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    password = factory.django.Password(DEFAULT_PASSWORD)
    first_name = "Test"
    last_name = factory.Sequence(lambda n: f"User{n}")
    role = User.Role.STAFF
    clinic = factory.SubFactory(ClinicFactory)


class DoctorProfileFactory(factory.django.DjangoModelFactory):
    """A doctor: a DOCTOR user plus the profile, with a department in the same clinic."""

    class Meta:
        model = DoctorProfile

    class Params:
        # Not a model field: just the clinic shared by the user and the department.
        clinic = factory.SubFactory(ClinicFactory)

    user = factory.SubFactory(
        UserFactory, role=User.Role.DOCTOR, clinic=factory.SelfAttribute("..clinic")
    )
    department = factory.SubFactory(DepartmentFactory, clinic=factory.SelfAttribute("..clinic"))
    specialization = "General Physician"
    license_number = factory.Sequence(lambda n: f"NMC-{n}")
    consultation_fee = Decimal("500.00")


class PatientProfileFactory(factory.django.DjangoModelFactory):
    """A patient record in a clinic."""

    class Meta:
        model = PatientProfile

    clinic = factory.SubFactory(ClinicFactory)
    first_name = "Patient"
    last_name = factory.Sequence(lambda n: f"Number{n}")
    phone = factory.Sequence(lambda n: f"98{n:08d}")
    gender = PatientProfile.Gender.FEMALE
