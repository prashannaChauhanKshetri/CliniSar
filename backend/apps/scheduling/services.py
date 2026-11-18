"""Business rules for schedules and visits: slot calculation, booking, walk-ins, status changes.

"Today" and "now" always mean Nepal time (settings.TIME_ZONE = "Asia/Kathmandu").
"""

import datetime
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import DoctorProfile, PatientProfile, User
from apps.clinics.models import Clinic
from apps.common.exceptions import Conflict

from .models import Appointment, DoctorSchedule


@dataclass(frozen=True, order=True)
class Slot:
    """One bookable piece of a doctor's working hours. Never stored, always calculated."""

    start_time: datetime.time
    end_time: datetime.time


# ---------- slots ----------


def split_into_slots(schedule: DoctorSchedule) -> list[Slot]:
    """Cut one block of working hours into slot_minutes pieces.

    Example: 10:00-11:00 with 20-minute slots gives 10:00, 10:20 and 10:40.
    A leftover piece shorter than slot_minutes at the end is dropped.
    """
    any_day = datetime.date(2000, 1, 1)  # times can only be added to through a datetime
    step = datetime.timedelta(minutes=schedule.slot_minutes)
    start = datetime.datetime.combine(any_day, schedule.start_time)
    block_end = datetime.datetime.combine(any_day, schedule.end_time)

    slots = []
    while start + step <= block_end:
        slots.append(Slot(start.time(), (start + step).time()))
        start += step
    return slots


def all_slots(doctor: DoctorProfile, day: datetime.date) -> list[Slot]:
    """Every slot of the doctor's working hours on that weekday, taken or not."""
    schedules = DoctorSchedule.objects.filter(doctor=doctor, weekday=day.weekday())
    slots = [slot for schedule in schedules for slot in split_into_slots(schedule)]
    return sorted(slots)


def taken_start_times(doctor: DoctorProfile, day: datetime.date) -> set[datetime.time]:
    """Start times that already have a booking which is not cancelled."""
    booked = Appointment.objects.filter(
        doctor=doctor, date=day, visit_type=Appointment.VisitType.SCHEDULED
    ).exclude(status=Appointment.Status.CANCELLED)
    return set(booked.values_list("start_time", flat=True))


def is_in_past(slot: Slot, day: datetime.date, now: datetime.datetime) -> bool:
    """True when the slot has already started (or the day is over) in Nepal time."""
    return day < now.date() or (day == now.date() and slot.start_time <= now.time())


def free_slots(
    doctor: DoctorProfile, day: datetime.date, now: datetime.datetime | None = None
) -> list[Slot]:
    """The slots a patient can still book: from the schedule, minus taken, minus past."""
    now = now or timezone.localtime()
    taken = taken_start_times(doctor, day)
    return [
        slot
        for slot in all_slots(doctor, day)
        if slot.start_time not in taken and not is_in_past(slot, day, now)
    ]


# ---------- creating visits ----------


def check_doctor_is_active(doctor: DoctorProfile) -> None:
    """A deactivated doctor cannot receive new visits."""
    if not doctor.user.is_active:
        raise ValidationError({"doctor": "This doctor is no longer active."})


def find_bookable_slot(
    doctor: DoctorProfile, day: datetime.date, start_time: datetime.time
) -> Slot:
    """Return the slot starting at start_time, or explain why it cannot be booked.

    Not one of the doctor's slots, or already past: 400. Already taken: 409.
    """
    slot = next((s for s in all_slots(doctor, day) if s.start_time == start_time), None)
    if slot is None:
        raise ValidationError({"start_time": "The doctor has no slot at this time."})
    if is_in_past(slot, day, timezone.localtime()):
        raise ValidationError({"start_time": "This slot is already in the past."})
    if start_time in taken_start_times(doctor, day):
        raise Conflict("This slot has just been booked. Please choose another time.")
    return slot


def book_appointment(
    *,
    clinic: Clinic,
    patient: PatientProfile,
    doctor: DoctorProfile,
    day: datetime.date,
    start_time: datetime.time,
    reason: str,
    booked_by: User,
) -> Appointment:
    """Book a time slot: check it is a real free slot, then insert, all in one transaction.

    Two people can pass the check at the same moment. Then the database's unique
    constraint lets only one insert succeed, and the other gets a 409.
    """
    check_doctor_is_active(doctor)
    try:
        with transaction.atomic():
            slot = find_bookable_slot(doctor, day, start_time)
            appointment = Appointment.objects.create(
                clinic=clinic,
                patient=patient,
                doctor=doctor,
                visit_type=Appointment.VisitType.SCHEDULED,
                date=day,
                start_time=slot.start_time,
                end_time=slot.end_time,
                reason=reason,
                booked_by=booked_by,
            )
    except IntegrityError as error:
        raise Conflict("This slot has just been booked. Please choose another time.") from error
    return appointment


def add_walk_in(
    *,
    clinic: Clinic,
    patient: PatientProfile,
    doctor: DoctorProfile,
    reason: str,
    booked_by: User,
) -> Appointment:
    """Add a patient to today's queue of a doctor with the next queue number.

    The doctor's row is locked while the number is chosen, so two receptionists
    adding walk-ins at the same moment get 1 and 2, never 1 and 1.
    """
    check_doctor_is_active(doctor)
    today = timezone.localdate()
    try:
        with transaction.atomic():
            DoctorProfile.objects.select_for_update().get(pk=doctor.pk)
            last = (
                Appointment.objects.filter(doctor=doctor, date=today, queue_number__isnull=False)
                .order_by("-queue_number")
                .values_list("queue_number", flat=True)
                .first()
            )
            appointment = Appointment.objects.create(
                clinic=clinic,
                patient=patient,
                doctor=doctor,
                visit_type=Appointment.VisitType.WALK_IN,
                date=today,
                queue_number=(last or 0) + 1,
                reason=reason,
                booked_by=booked_by,
            )
    except IntegrityError as error:  # backstop: the unique constraint on queue_number
        raise Conflict("Please try again: the queue changed while saving.") from error
    return appointment


# ---------- status changes ----------


def lock_booked_appointment(appointment: Appointment) -> Appointment:
    """Re-read the appointment with a row lock and check it is still BOOKED."""
    locked = Appointment.objects.select_for_update().get(pk=appointment.pk)
    if locked.status != Appointment.Status.BOOKED:
        raise ValidationError(
            {"status": f"Only booked appointments can be changed; this one is {locked.status}."}
        )
    return locked


@transaction.atomic
def cancel_appointment(appointment: Appointment, *, user: User, reason: str) -> Appointment:
    """Cancel a BOOKED appointment and record who cancelled it and why."""
    locked = lock_booked_appointment(appointment)
    locked.status = Appointment.Status.CANCELLED
    locked.cancelled_by = user
    locked.cancel_reason = reason
    locked.save(update_fields=["status", "cancelled_by", "cancel_reason", "updated_at"])
    return locked


@transaction.atomic
def complete_appointment(appointment: Appointment) -> Appointment:
    """Mark a BOOKED appointment as COMPLETED (the patient was seen)."""
    locked = lock_booked_appointment(appointment)
    locked.status = Appointment.Status.COMPLETED
    locked.save(update_fields=["status", "updated_at"])
    return locked
