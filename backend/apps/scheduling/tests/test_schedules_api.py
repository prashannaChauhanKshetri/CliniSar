"""Tests for doctors/<id>/schedules/ and doctors/<id>/slots/."""

import pytest

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, UserFactory
from apps.scheduling.models import DoctorSchedule
from apps.scheduling.tests.factories import DoctorScheduleFactory
from apps.scheduling.tests.helpers import next_date_for

Role = User.Role
pytestmark = pytest.mark.django_db

MORNING = {"weekday": 0, "start_time": "10:00", "end_time": "13:00", "slot_minutes": 20}


def schedules_url(doctor) -> str:
    return f"/api/v1/doctors/{doctor.id}/schedules/"


def slots_url(doctor) -> str:
    return f"/api/v1/doctors/{doctor.id}/slots/"


def test_doctor_creates_own_schedule(login_as) -> None:
    doctor = DoctorProfileFactory()

    response = login_as(doctor.user).post(schedules_url(doctor), MORNING)

    assert response.status_code == 201
    assert response.data["weekday_name"] == "Monday"
    schedule = DoctorSchedule.objects.get(id=response.data["id"])
    assert schedule.doctor == doctor
    assert schedule.clinic == doctor.user.clinic


def test_doctor_cannot_change_another_doctors_schedule(login_as) -> None:
    doctor = DoctorProfileFactory()
    colleague = DoctorProfileFactory(clinic=doctor.user.clinic)
    client = login_as(doctor.user)

    assert client.post(schedules_url(colleague), MORNING).status_code == 403
    assert client.get(schedules_url(colleague)).status_code == 200  # reading is fine


def test_admin_manages_any_doctors_schedule(login_as) -> None:
    schedule = DoctorScheduleFactory()
    admin = UserFactory(clinic=schedule.clinic, role=Role.CLINIC_ADMIN)
    url = f"{schedules_url(schedule.doctor)}{schedule.id}/"
    client = login_as(admin)

    assert client.patch(url, {"slot_minutes": 15}).status_code == 200
    assert client.delete(url).status_code == 204


def test_staff_can_read_but_not_change_schedules(login_as) -> None:
    doctor = DoctorProfileFactory()
    client = login_as(UserFactory(clinic=doctor.user.clinic, role=Role.STAFF))
    assert client.get(schedules_url(doctor)).status_code == 200
    assert client.post(schedules_url(doctor), MORNING).status_code == 403


@pytest.mark.parametrize("role", [Role.PHARMACIST, Role.LAB_TECHNICIAN])
def test_pharmacy_and_lab_cannot_see_schedules_or_slots(login_as, role) -> None:
    doctor = DoctorProfileFactory()
    client = login_as(UserFactory(clinic=doctor.user.clinic, role=role))
    assert client.get(schedules_url(doctor)).status_code == 403
    assert client.get(slots_url(doctor), {"date": "2030-01-07"}).status_code == 403


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"start_time": "13:00", "end_time": "10:00"}, "end_time"),
        ({"start_time": "10:00", "end_time": "10:10"}, "slot_minutes"),
        ({"slot_minutes": 0}, "slot_minutes"),
        ({"weekday": 7}, "weekday"),
    ],
)
def test_invalid_schedules_are_refused(login_as, changes, field) -> None:
    doctor = DoctorProfileFactory()
    response = login_as(doctor.user).post(schedules_url(doctor), {**MORNING, **changes})
    assert response.status_code == 400
    assert field in response.data


def test_overlapping_blocks_are_refused(login_as) -> None:
    doctor = DoctorProfileFactory()
    client = login_as(doctor.user)
    client.post(schedules_url(doctor), MORNING)  # Monday 10:00-13:00

    overlapping = {**MORNING, "start_time": "12:00", "end_time": "14:00"}
    touching = {**MORNING, "start_time": "13:00", "end_time": "15:00"}

    assert client.post(schedules_url(doctor), overlapping).status_code == 400
    assert client.post(schedules_url(doctor), touching).status_code == 201


def test_editing_a_block_does_not_count_as_overlapping_itself(login_as) -> None:
    schedule = DoctorScheduleFactory()
    url = f"{schedules_url(schedule.doctor)}{schedule.id}/"
    response = login_as(schedule.doctor.user).patch(url, {"end_time": "14:00"})
    assert response.status_code == 200


def test_slots_endpoint_lists_free_slots(login_as) -> None:
    schedule = DoctorScheduleFactory(start_time="10:00", end_time="11:00")
    staff = UserFactory(clinic=schedule.clinic, role=Role.STAFF)

    response = login_as(staff).get(slots_url(schedule.doctor), {"date": next_date_for(0)})

    assert response.status_code == 200
    assert response.data == [
        {"start_time": "10:00:00", "end_time": "10:20:00"},
        {"start_time": "10:20:00", "end_time": "10:40:00"},
        {"start_time": "10:40:00", "end_time": "11:00:00"},
    ]


@pytest.mark.parametrize("query", [{}, {"date": "not-a-date"}, {"date": "2030-02-30"}])
def test_slots_endpoint_needs_a_valid_date(login_as, query) -> None:
    doctor = DoctorProfileFactory()
    client = login_as(UserFactory(clinic=doctor.user.clinic, role=Role.STAFF))
    assert client.get(slots_url(doctor), query).status_code == 400


def test_unknown_doctor_gives_404(login_as) -> None:
    client = login_as(UserFactory(role=Role.STAFF))
    url = "/api/v1/doctors/00000000-0000-0000-0000-000000000000/slots/"
    assert client.get(url, {"date": "2030-01-07"}).status_code == 404
