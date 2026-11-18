"""Tests for the database rules on schedules and appointments."""

import datetime

import pytest
from django.db import IntegrityError

from apps.scheduling.models import Appointment
from apps.scheduling.tests.factories import AppointmentFactory, DoctorScheduleFactory


@pytest.mark.django_db
def test_schedule_must_start_before_it_ends() -> None:
    with pytest.raises(IntegrityError):
        DoctorScheduleFactory(start_time=datetime.time(13, 0), end_time=datetime.time(10, 0))


@pytest.mark.django_db
def test_schedule_start_is_unique_per_doctor_and_weekday() -> None:
    schedule = DoctorScheduleFactory()
    with pytest.raises(IntegrityError):
        DoctorScheduleFactory(
            clinic=schedule.clinic,
            doctor=schedule.doctor,
            weekday=schedule.weekday,
            start_time=schedule.start_time,
        )


@pytest.mark.django_db
def test_same_slot_cannot_be_booked_twice() -> None:
    """The database itself blocks a double booking."""
    first = AppointmentFactory()
    with pytest.raises(IntegrityError):
        AppointmentFactory(
            clinic=first.clinic, doctor=first.doctor, date=first.date, start_time=first.start_time
        )


@pytest.mark.django_db
def test_cancelled_slot_can_be_booked_again() -> None:
    cancelled = AppointmentFactory(status=Appointment.Status.CANCELLED)
    again = AppointmentFactory(
        clinic=cancelled.clinic,
        doctor=cancelled.doctor,
        date=cancelled.date,
        start_time=cancelled.start_time,
    )
    assert again.status == Appointment.Status.BOOKED


@pytest.mark.django_db
def test_walk_in_must_have_a_queue_number_and_no_time() -> None:
    with pytest.raises(IntegrityError):
        AppointmentFactory(walk_in=True, queue_number=None)


@pytest.mark.django_db
def test_scheduled_visit_must_have_a_time_and_no_queue_number() -> None:
    with pytest.raises(IntegrityError):
        AppointmentFactory(queue_number=3)


@pytest.mark.django_db
def test_queue_number_is_unique_per_doctor_and_day() -> None:
    first = AppointmentFactory(walk_in=True)
    with pytest.raises(IntegrityError):
        AppointmentFactory(walk_in=True, clinic=first.clinic, doctor=first.doctor, date=first.date)
