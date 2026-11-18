"""Tests for appointments/: booking, walk-ins, double booking, cancel and complete."""

import datetime
from unittest import mock

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, PatientProfileFactory, UserFactory
from apps.scheduling import services
from apps.scheduling.models import Appointment
from apps.scheduling.tests.factories import AppointmentFactory, DoctorScheduleFactory
from apps.scheduling.tests.helpers import next_date_for

APPOINTMENTS = "/api/v1/appointments/"
Role = User.Role
pytestmark = pytest.mark.django_db


@pytest.fixture
def schedule():
    """Dr. X works Monday 10:00-11:00 in 20-minute slots."""
    return DoctorScheduleFactory(weekday=0, start_time="10:00", end_time="11:00")


@pytest.fixture
def staff(schedule) -> User:
    return UserFactory(clinic=schedule.clinic, role=Role.STAFF)


@pytest.fixture
def patient(schedule):
    return PatientProfileFactory(clinic=schedule.clinic)


def booking(schedule, patient, start_time="10:20", **changes) -> dict:
    data = {
        "patient": str(patient.id),
        "doctor": str(schedule.doctor.id),
        "date": next_date_for(0).isoformat(),
        "start_time": start_time,
        "reason": "Fever",
    }
    return {**data, **changes}


def walk_in(doctor, patient) -> dict:
    return {"visit_type": "WALK_IN", "patient": str(patient.id), "doctor": str(doctor.id)}


# ---------- booking a time slot ----------


def test_staff_books_a_free_slot(login_as, schedule, staff, patient) -> None:
    response = login_as(staff).post(APPOINTMENTS, booking(schedule, patient))

    assert response.status_code == 201
    assert response.data["status"] == "BOOKED"
    assert response.data["visit_type"] == "SCHEDULED"
    assert response.data["start_time"] == "10:20:00"
    assert response.data["end_time"] == "10:40:00"  # taken from the slot, not the client
    assert response.data["patient_name"] == patient.full_name
    appointment = Appointment.objects.get(id=response.data["id"])
    assert appointment.clinic == staff.clinic
    assert appointment.booked_by == staff


def test_booked_slot_disappears_from_free_slots(login_as, schedule, staff, patient) -> None:
    client = login_as(staff)
    client.post(APPOINTMENTS, booking(schedule, patient))

    url = f"/api/v1/doctors/{schedule.doctor.id}/slots/"
    free = client.get(url, {"date": next_date_for(0)}).data

    assert [slot["start_time"] for slot in free] == ["10:00:00", "10:40:00"]


def test_booking_a_taken_slot_returns_409(login_as, schedule, staff, patient) -> None:
    client = login_as(staff)
    assert client.post(APPOINTMENTS, booking(schedule, patient)).status_code == 201

    other_patient = PatientProfileFactory(clinic=schedule.clinic)
    response = client.post(APPOINTMENTS, booking(schedule, other_patient))

    assert response.status_code == 409
    assert "just been booked" in response.data["detail"]
    assert Appointment.objects.count() == 1


def test_race_between_two_bookings_returns_409(login_as, schedule, staff, patient) -> None:
    """Both requests pass the "is it free?" check; the database constraint stops the second.

    We imitate the race by letting the check wrongly say the slot is still free.
    """
    client = login_as(staff)
    client.post(APPOINTMENTS, booking(schedule, patient))
    still_free = services.Slot(datetime.time(10, 20), datetime.time(10, 40))

    with mock.patch.object(services, "find_bookable_slot", return_value=still_free):
        response = client.post(APPOINTMENTS, booking(schedule, patient))

    assert response.status_code == 409
    assert Appointment.objects.count() == 1


def test_cancelled_slot_can_be_booked_again(login_as, schedule, staff, patient) -> None:
    client = login_as(staff)
    first = client.post(APPOINTMENTS, booking(schedule, patient)).data
    client.post(f"{APPOINTMENTS}{first['id']}/cancel/", {"reason": "Patient called"})

    assert client.post(APPOINTMENTS, booking(schedule, patient)).status_code == 201


@pytest.mark.parametrize("start_time", ["10:10", "11:00", "09:40"])
def test_time_that_is_not_a_slot_is_refused(login_as, schedule, staff, patient, start_time):
    response = login_as(staff).post(APPOINTMENTS, booking(schedule, patient, start_time))
    assert response.status_code == 400
    assert "start_time" in response.data


def test_day_the_doctor_does_not_work_is_refused(login_as, schedule, staff, patient) -> None:
    a_tuesday = next_date_for(1).isoformat()
    response = login_as(staff).post(APPOINTMENTS, booking(schedule, patient, date=a_tuesday))
    assert response.status_code == 400


def test_slot_in_the_past_is_refused(login_as, schedule, staff, patient) -> None:
    last_week = (next_date_for(0) - datetime.timedelta(days=14)).isoformat()
    response = login_as(staff).post(APPOINTMENTS, booking(schedule, patient, date=last_week))
    assert response.status_code == 400
    assert "past" in str(response.data["start_time"])


def test_scheduled_visit_needs_date_and_start_time(login_as, schedule, staff, patient) -> None:
    data = booking(schedule, patient)
    del data["date"], data["start_time"]
    response = login_as(staff).post(APPOINTMENTS, data)
    assert response.status_code == 400
    assert {"date", "start_time"} <= set(response.data)


def test_deactivated_doctor_cannot_be_booked(login_as, schedule, staff, patient) -> None:
    schedule.doctor.user.is_active = False
    schedule.doctor.user.save()
    response = login_as(staff).post(APPOINTMENTS, booking(schedule, patient))
    assert response.status_code == 400
    assert "doctor" in response.data


def test_patient_and_doctor_must_be_from_the_same_clinic(login_as, schedule, staff) -> None:
    """Another clinic's ids are refused as if they did not exist."""
    their_patient = PatientProfileFactory()
    their_doctor = DoctorProfileFactory()
    data = booking(schedule, their_patient, doctor=str(their_doctor.id))

    response = login_as(staff).post(APPOINTMENTS, data)

    assert response.status_code == 400
    assert {"patient", "doctor"} <= set(response.data)


# ---------- walk-ins ----------


def test_walk_ins_get_queue_numbers_per_doctor_for_today(login_as, staff, patient) -> None:
    doctor = DoctorProfileFactory(clinic=staff.clinic)  # no schedule needed for walk-ins
    other_doctor = DoctorProfileFactory(clinic=staff.clinic)
    client = login_as(staff)

    first = client.post(APPOINTMENTS, walk_in(doctor, patient)).data
    second = client.post(APPOINTMENTS, walk_in(doctor, patient)).data
    other = client.post(APPOINTMENTS, walk_in(other_doctor, patient)).data

    assert (first["queue_number"], second["queue_number"], other["queue_number"]) == (1, 2, 1)
    assert first["date"] == timezone.localdate().isoformat()
    assert first["start_time"] is None
    assert first["visit_type"] == "WALK_IN"


def test_cancelled_walk_in_keeps_its_queue_number(login_as, staff, patient) -> None:
    doctor = DoctorProfileFactory(clinic=staff.clinic)
    client = login_as(staff)
    first = client.post(APPOINTMENTS, walk_in(doctor, patient)).data
    client.post(f"{APPOINTMENTS}{first['id']}/cancel/", {"reason": "Left"})

    second = client.post(APPOINTMENTS, walk_in(doctor, patient)).data

    assert second["queue_number"] == 2  # numbers are never reused within the day


def test_walk_in_ignores_a_date_sent_by_the_client(login_as, staff, patient) -> None:
    doctor = DoctorProfileFactory(clinic=staff.clinic)
    data = {**walk_in(doctor, patient), "date": "2031-01-01", "start_time": "10:00"}
    response = login_as(staff).post(APPOINTMENTS, data)
    assert response.data["date"] == timezone.localdate().isoformat()
    assert response.data["start_time"] is None


# ---------- cancel and complete ----------


def test_cancel_records_who_and_why(login_as, staff) -> None:
    appointment = AppointmentFactory(clinic=staff.clinic)

    response = login_as(staff).post(
        f"{APPOINTMENTS}{appointment.id}/cancel/", {"reason": "Patient is travelling"}
    )

    assert response.status_code == 200
    appointment.refresh_from_db()
    assert appointment.status == Appointment.Status.CANCELLED
    assert appointment.cancelled_by == staff
    assert appointment.cancel_reason == "Patient is travelling"


def test_cancel_needs_a_reason(login_as, staff) -> None:
    appointment = AppointmentFactory(clinic=staff.clinic)
    response = login_as(staff).post(f"{APPOINTMENTS}{appointment.id}/cancel/", {})
    assert response.status_code == 400
    assert "reason" in response.data


def test_complete_marks_the_visit_done(login_as, staff) -> None:
    appointment = AppointmentFactory(clinic=staff.clinic)
    response = login_as(staff).post(f"{APPOINTMENTS}{appointment.id}/complete/")
    assert response.status_code == 200
    assert response.data["status"] == "COMPLETED"


@pytest.mark.parametrize("status", ["COMPLETED", "CANCELLED", "NO_SHOW"])
@pytest.mark.parametrize("action", ["cancel", "complete"])
def test_only_booked_appointments_can_be_cancelled_or_completed(
    login_as, staff, status, action
) -> None:
    appointment = AppointmentFactory(clinic=staff.clinic, status=status)

    response = login_as(staff).post(f"{APPOINTMENTS}{appointment.id}/{action}/", {"reason": "x"})

    assert response.status_code == 400
    appointment.refresh_from_db()
    assert appointment.status == status  # unchanged


def test_appointments_cannot_be_edited_or_deleted_directly(login_as, staff) -> None:
    url = f"{APPOINTMENTS}{AppointmentFactory(clinic=staff.clinic).id}/"
    client = login_as(staff)
    assert client.patch(url, {"status": "COMPLETED"}).status_code == 405
    assert client.delete(url).status_code == 405


# ---------- roles ----------


def test_doctor_sees_and_handles_only_own_appointments(login_as) -> None:
    mine = AppointmentFactory()
    doctor_user = mine.doctor.user
    colleagues = AppointmentFactory(clinic=mine.clinic)
    client = login_as(doctor_user)

    listed = [row["id"] for row in client.get(APPOINTMENTS).data["results"]]
    assert listed == [str(mine.id)]
    assert client.get(f"{APPOINTMENTS}{colleagues.id}/").status_code == 404
    assert client.post(f"{APPOINTMENTS}{colleagues.id}/complete/").status_code == 404
    assert client.post(f"{APPOINTMENTS}{mine.id}/complete/").status_code == 200


def test_doctor_cancels_own_appointment(login_as) -> None:
    mine = AppointmentFactory()
    response = login_as(mine.doctor.user).post(
        f"{APPOINTMENTS}{mine.id}/cancel/", {"reason": "Doctor on leave"}
    )
    assert response.status_code == 200


def test_doctor_cannot_book(login_as, schedule, patient) -> None:
    response = login_as(schedule.doctor.user).post(APPOINTMENTS, booking(schedule, patient))
    assert response.status_code == 403


@pytest.mark.parametrize("role", [Role.PHARMACIST, Role.LAB_TECHNICIAN])
def test_pharmacy_and_lab_cannot_use_appointments(login_as, role) -> None:
    assert login_as(UserFactory(role=role)).get(APPOINTMENTS).status_code == 403


def test_admin_can_do_everything_staff_can(login_as, schedule, patient) -> None:
    admin = UserFactory(clinic=schedule.clinic, role=Role.CLINIC_ADMIN)
    client = login_as(admin)
    created = client.post(APPOINTMENTS, booking(schedule, patient))
    assert created.status_code == 201
    assert client.post(f"{APPOINTMENTS}{created.data['id']}/complete/").status_code == 200


# ---------- list filters ----------


def test_list_can_be_filtered_by_date_status_and_type(login_as, staff) -> None:
    day = datetime.date(2030, 3, 1)
    wanted = AppointmentFactory(clinic=staff.clinic, date=day)
    AppointmentFactory(clinic=staff.clinic, date=day, status=Appointment.Status.CANCELLED)
    AppointmentFactory(clinic=staff.clinic, date=day + datetime.timedelta(days=1))
    client = login_as(staff)

    rows = client.get(APPOINTMENTS, {"date": "2030-03-01", "status": "BOOKED"}).data["results"]
    assert [row["id"] for row in rows] == [str(wanted.id)]

    walk_ins = client.get(APPOINTMENTS, {"visit_type": "WALK_IN"}).data["results"]
    assert walk_ins == []


def test_list_can_be_filtered_by_date_range(login_as, staff) -> None:
    for day in (1, 5, 9):
        AppointmentFactory(clinic=staff.clinic, date=datetime.date(2030, 3, day))
    rows = (
        login_as(staff)
        .get(APPOINTMENTS, {"date_from": "2030-03-02", "date_to": "2030-03-08"})
        .data["results"]
    )
    assert [row["date"] for row in rows] == ["2030-03-05"]
