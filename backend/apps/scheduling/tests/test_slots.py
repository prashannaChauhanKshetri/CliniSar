"""Tests for slot calculation (services.free_slots and its helpers)."""

import datetime

import pytest

from apps.scheduling import services
from apps.scheduling.models import Appointment, DoctorSchedule
from apps.scheduling.services import Slot
from apps.scheduling.tests.factories import AppointmentFactory, DoctorScheduleFactory

MONDAY = DoctorSchedule.Weekday.MONDAY
A_MONDAY = datetime.date(2030, 1, 7)  # a Monday far in the future
NEPAL = datetime.timezone(datetime.timedelta(hours=5, minutes=45))


def t(text: str) -> datetime.time:
    """t("10:20") -> time(10, 20), to keep the tests short."""
    return datetime.time.fromisoformat(text)


def starts(slots: list[Slot]) -> list[str]:
    return [slot.start_time.strftime("%H:%M") for slot in slots]


def nepal_time(day: datetime.date, clock: str) -> datetime.datetime:
    return datetime.datetime.combine(day, t(clock), tzinfo=NEPAL)


def test_working_hours_are_cut_into_equal_slots() -> None:
    schedule = DoctorSchedule(start_time=t("10:00"), end_time=t("11:00"), slot_minutes=20)
    assert services.split_into_slots(schedule) == [
        Slot(t("10:00"), t("10:20")),
        Slot(t("10:20"), t("10:40")),
        Slot(t("10:40"), t("11:00")),
    ]


def test_a_leftover_piece_shorter_than_a_slot_is_dropped() -> None:
    schedule = DoctorSchedule(start_time=t("10:00"), end_time=t("10:50"), slot_minutes=20)
    assert starts(services.split_into_slots(schedule)) == ["10:00", "10:20"]


@pytest.mark.django_db
def test_free_slots_combine_all_blocks_of_that_weekday_in_order() -> None:
    afternoon = DoctorScheduleFactory(start_time=t("14:00"), end_time=t("14:40"))
    DoctorScheduleFactory(
        clinic=afternoon.clinic,
        doctor=afternoon.doctor,
        start_time=t("09:00"),
        end_time=t("09:40"),
    )
    slots = services.free_slots(afternoon.doctor, A_MONDAY)
    assert starts(slots) == ["09:00", "09:20", "14:00", "14:20"]


@pytest.mark.django_db
def test_no_slots_on_a_day_without_a_schedule() -> None:
    schedule = DoctorScheduleFactory(weekday=MONDAY)
    a_tuesday = A_MONDAY + datetime.timedelta(days=1)
    assert services.free_slots(schedule.doctor, a_tuesday) == []


@pytest.mark.django_db
def test_booked_slots_are_removed_but_cancelled_ones_come_back() -> None:
    schedule = DoctorScheduleFactory(start_time=t("10:00"), end_time=t("11:00"))
    book = {"clinic": schedule.clinic, "doctor": schedule.doctor, "date": A_MONDAY}
    AppointmentFactory(**book, start_time=t("10:00"), end_time=t("10:20"))
    AppointmentFactory(
        **book,
        start_time=t("10:20"),
        end_time=t("10:40"),
        status=Appointment.Status.CANCELLED,
    )

    assert starts(services.free_slots(schedule.doctor, A_MONDAY)) == ["10:20", "10:40"]


@pytest.mark.django_db
def test_completed_and_no_show_visits_still_take_their_slot() -> None:
    schedule = DoctorScheduleFactory(start_time=t("10:00"), end_time=t("10:40"))
    book = {"clinic": schedule.clinic, "doctor": schedule.doctor, "date": A_MONDAY}
    AppointmentFactory(**book, start_time=t("10:00"), status=Appointment.Status.COMPLETED)
    AppointmentFactory(
        **book, start_time=t("10:20"), end_time=t("10:40"), status=Appointment.Status.NO_SHOW
    )
    assert services.free_slots(schedule.doctor, A_MONDAY) == []


@pytest.mark.django_db
def test_walk_ins_do_not_take_time_slots() -> None:
    schedule = DoctorScheduleFactory(start_time=t("10:00"), end_time=t("10:40"))
    AppointmentFactory(clinic=schedule.clinic, doctor=schedule.doctor, date=A_MONDAY, walk_in=True)
    assert starts(services.free_slots(schedule.doctor, A_MONDAY)) == ["10:00", "10:20"]


@pytest.mark.django_db
def test_slots_that_already_started_today_are_removed() -> None:
    schedule = DoctorScheduleFactory(start_time=t("10:00"), end_time=t("11:00"))
    now = nepal_time(A_MONDAY, "10:20")  # the 10:20 slot starts right now

    assert starts(services.free_slots(schedule.doctor, A_MONDAY, now=now)) == ["10:40"]


@pytest.mark.django_db
def test_a_past_day_has_no_free_slots() -> None:
    schedule = DoctorScheduleFactory()
    now = nepal_time(A_MONDAY + datetime.timedelta(days=1), "08:00")
    assert services.free_slots(schedule.doctor, A_MONDAY, now=now) == []


@pytest.mark.django_db
def test_a_future_day_has_all_its_slots() -> None:
    schedule = DoctorScheduleFactory(start_time=t("10:00"), end_time=t("11:00"))
    now = nepal_time(A_MONDAY - datetime.timedelta(days=1), "23:59")
    assert len(services.free_slots(schedule.doctor, A_MONDAY, now=now)) == 3


@pytest.mark.django_db
def test_slots_of_another_doctor_are_not_mixed_in() -> None:
    mine = DoctorScheduleFactory(start_time=t("10:00"), end_time=t("10:20"))
    DoctorScheduleFactory(clinic=mine.clinic, start_time=t("15:00"), end_time=t("15:20"))
    assert starts(services.free_slots(mine.doctor, A_MONDAY)) == ["10:00"]
