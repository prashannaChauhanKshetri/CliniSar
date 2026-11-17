"""The most important test in the project: one clinic can never see another clinic's data.

For every tenant endpoint we create one object in clinic A and one in clinic B, log
in as clinic A's admin, and check that clinic B's object is missing from the list
and returns 404 on its detail URL (also for update and delete).

When a new tenant endpoint is added in a later phase, add one line to ENDPOINTS.
"""

from collections.abc import Callable
from dataclasses import dataclass

import pytest

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, PatientProfileFactory, UserFactory
from apps.clinics.models import Clinic
from apps.clinics.tests.factories import ClinicFactory, DepartmentFactory


@dataclass
class Endpoint:
    """A tenant endpoint and how to create one of its objects inside a given clinic."""

    url: str
    make_object: Callable[[Clinic], object]

    def __str__(self) -> str:  # used as the test id, e.g. "departments"
        return self.url.strip("/")


ENDPOINTS = [
    Endpoint("/api/v1/departments/", lambda clinic: DepartmentFactory(clinic=clinic)),
    Endpoint("/api/v1/staff/", lambda clinic: UserFactory(clinic=clinic)),
    Endpoint("/api/v1/doctors/", lambda clinic: DoctorProfileFactory(clinic=clinic)),
    Endpoint("/api/v1/patients/", lambda clinic: PatientProfileFactory(clinic=clinic)),
]


@pytest.fixture
def two_clinics():
    """Clinic A (ours) and clinic B (someone else's)."""
    return ClinicFactory(name="Clinic A"), ClinicFactory(name="Clinic B")


def ids_in_list(response) -> set[str]:
    """The ids on the first page of a paginated list response."""
    return {str(row["id"]) for row in response.data["results"]}


@pytest.mark.django_db
@pytest.mark.parametrize("endpoint", ENDPOINTS, ids=str)
def test_other_clinics_objects_are_hidden(endpoint, two_clinics, login_as) -> None:
    clinic_a, clinic_b = two_clinics
    ours = endpoint.make_object(clinic_a)
    theirs = endpoint.make_object(clinic_b)
    client = login_as(UserFactory(clinic=clinic_a, role=User.Role.CLINIC_ADMIN))

    # The list shows ours and not theirs.
    listed = ids_in_list(client.get(endpoint.url))
    assert str(ours.id) in listed
    assert str(theirs.id) not in listed

    # Their object behaves as if it did not exist.
    their_url = f"{endpoint.url}{theirs.id}/"
    assert client.get(their_url).status_code == 404
    assert client.patch(their_url, {}).status_code == 404
    assert client.delete(their_url).status_code == 404

    # And ours is reachable, so the 404 above is really about the clinic.
    assert client.get(f"{endpoint.url}{ours.id}/").status_code == 200


@pytest.mark.django_db
def test_clinic_endpoint_returns_only_the_users_own_clinic(two_clinics, login_as) -> None:
    clinic_a, _ = two_clinics
    client = login_as(UserFactory(clinic=clinic_a, role=User.Role.STAFF))
    response = client.get("/api/v1/clinic/")
    assert response.data["id"] == str(clinic_a.id)


@pytest.mark.django_db
def test_clinic_id_sent_by_the_client_is_ignored(two_clinics, login_as) -> None:
    """The clinic always comes from the logged-in user, never from the request body."""
    clinic_a, clinic_b = two_clinics
    client = login_as(UserFactory(clinic=clinic_a, role=User.Role.CLINIC_ADMIN))

    response = client.post(
        "/api/v1/departments/", {"name": "Cardiology", "clinic": str(clinic_b.id)}
    )

    assert response.status_code == 201
    assert clinic_a.department_set.filter(name="Cardiology").exists()
    assert not clinic_b.department_set.exists()


@pytest.mark.django_db
def test_doctor_cannot_be_put_in_another_clinics_department(two_clinics, login_as) -> None:
    """Related objects sent by id must belong to the same clinic."""
    clinic_a, clinic_b = two_clinics
    their_department = DepartmentFactory(clinic=clinic_b)
    client = login_as(UserFactory(clinic=clinic_a, role=User.Role.CLINIC_ADMIN))

    response = client.post(
        "/api/v1/doctors/",
        {
            "email": "doc@example.com",
            "first_name": "Hari",
            "last_name": "Rai",
            "password": "a-good-pass-123",
            "department": str(their_department.id),
        },
    )

    assert response.status_code == 400
    assert "department" in response.data
