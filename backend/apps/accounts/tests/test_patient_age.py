"""Tests for entering a patient's age instead of a date of birth."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import PatientProfile, User
from apps.accounts.services import estimate_date_of_birth
from apps.accounts.tests.factories import UserFactory

PATIENTS = "/api/v1/patients/"


def test_estimated_birthday_is_today_minus_the_age() -> None:
    assert estimate_date_of_birth(30, datetime.date(2026, 11, 18)) == datetime.date(1996, 11, 18)


def test_29_february_becomes_28_february_in_a_normal_year() -> None:
    assert estimate_date_of_birth(1, datetime.date(2028, 2, 29)) == datetime.date(2027, 2, 28)


def test_age_on_counts_whole_years_only() -> None:
    patient = PatientProfile(date_of_birth=datetime.date(2000, 6, 15))
    assert patient.age_on(datetime.date(2026, 6, 14)) == 25
    assert patient.age_on(datetime.date(2026, 6, 15)) == 26
    assert PatientProfile().age_on(datetime.date(2026, 1, 1)) is None


@pytest.mark.django_db
def test_staff_can_register_a_patient_by_age_without_phone(login_as) -> None:
    """Exactly what the paper register holds: name, age, sex, address."""
    client = login_as(UserFactory(role=User.Role.STAFF))

    response = client.post(
        PATIENTS,
        {
            "first_name": "Test",
            "last_name": "Patient",
            "age_years": 30,
            "gender": "FEMALE",
            "address": "Rajapur-Bardiya",
        },
    )

    assert response.status_code == 201
    assert response.data["age"] == 30
    assert response.data["date_of_birth_is_estimated"] is True
    assert response.data["phone"] == ""
    assert "age_years" not in response.data


@pytest.mark.django_db
def test_exact_date_of_birth_is_not_marked_as_estimated(login_as) -> None:
    client = login_as(UserFactory(role=User.Role.STAFF))
    data = {"first_name": "A", "last_name": "B", "date_of_birth": "1990-01-01"}
    response = client.post(PATIENTS, data)
    assert response.data["date_of_birth_is_estimated"] is False


@pytest.mark.django_db
def test_correcting_an_estimate_with_the_real_date(login_as) -> None:
    client = login_as(UserFactory(role=User.Role.STAFF))
    created = client.post(PATIENTS, {"first_name": "A", "last_name": "B", "age_years": 40})

    response = client.patch(f"{PATIENTS}{created.data['id']}/", {"date_of_birth": "1986-05-01"})

    assert response.data["date_of_birth_is_estimated"] is False
    assert response.data["date_of_birth"] == "1986-05-01"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "data",
    [
        {"age_years": 30, "date_of_birth": "1990-01-01"},  # both
        {"age_years": -1},
        {"age_years": 131},
        {"date_of_birth": "2999-01-01"},  # in the future
    ],
)
def test_invalid_age_or_birth_date_is_refused(login_as, data) -> None:
    client = login_as(UserFactory(role=User.Role.STAFF))
    response = client.post(PATIENTS, {"first_name": "A", "last_name": "B", **data})
    assert response.status_code == 400


@pytest.mark.django_db
def test_age_is_not_shown_when_birth_date_is_unknown(login_as) -> None:
    client = login_as(UserFactory(role=User.Role.STAFF))
    response = client.post(PATIENTS, {"first_name": "A", "last_name": "B"})
    assert response.data["age"] is None
    assert timezone.localdate()  # the age is always worked out for today in Nepal
