"""Tests for the User, DoctorProfile and PatientProfile models."""

import pytest
from django.db import IntegrityError

from apps.accounts.models import User
from apps.accounts.tests.factories import (
    DoctorProfileFactory,
    PatientProfileFactory,
    UserFactory,
)
from apps.clinics.tests.factories import ClinicFactory


@pytest.mark.django_db
def test_create_user_hashes_password_and_lowercases_email() -> None:
    clinic = ClinicFactory()
    user = User.objects.create_user(
        "Sita@Example.COM", "test-pass-123", role=User.Role.STAFF, clinic=clinic
    )
    assert user.email == "sita@example.com"
    assert user.password != "test-pass-123"  # stored as a hash, never plain text
    assert user.check_password("test-pass-123")


@pytest.mark.django_db
def test_create_superuser_is_super_admin_without_clinic() -> None:
    user = User.objects.create_superuser("owner@example.com", "test-pass-123")
    assert user.role == User.Role.SUPER_ADMIN
    assert user.clinic is None
    assert user.is_staff and user.is_superuser


def test_user_logs_in_with_email_not_username() -> None:
    assert User.USERNAME_FIELD == "email"
    assert User.username is None  # the username column was removed


@pytest.mark.django_db
def test_email_is_unique_across_all_clinics() -> None:
    UserFactory(email="same@example.com")
    with pytest.raises(IntegrityError):
        UserFactory(email="same@example.com")


@pytest.mark.django_db
def test_clinic_user_must_have_a_clinic() -> None:
    """Only the super admin may have no clinic; the database enforces it."""
    with pytest.raises(IntegrityError):
        UserFactory(role=User.Role.DOCTOR, clinic=None)


@pytest.mark.django_db
def test_doctor_profile_belongs_to_a_doctor_user() -> None:
    doctor = DoctorProfileFactory()
    assert doctor.user.role == User.Role.DOCTOR
    assert doctor.user.doctor_profile == doctor


@pytest.mark.django_db
def test_patient_is_a_clinic_record_with_a_full_name() -> None:
    patient = PatientProfileFactory(first_name="Ram", last_name="Thapa")
    assert patient.full_name == "Ram Thapa"
    assert patient.clinic is not None
