"""Test factories for doctor schedules and appointments."""

import datetime

import factory

from apps.accounts.tests.factories import DoctorProfileFactory, PatientProfileFactory, UserFactory
from apps.clinics.tests.factories import ClinicFactory
from apps.scheduling.models import Appointment, DoctorSchedule


class DoctorScheduleFactory(factory.django.DjangoModelFactory):
    """Monday 10:00-13:00 in 20-minute slots, for a doctor in the same clinic."""

    class Meta:
        model = DoctorSchedule

    clinic = factory.SubFactory(ClinicFactory)
    doctor = factory.SubFactory(DoctorProfileFactory, clinic=factory.SelfAttribute("..clinic"))
    weekday = DoctorSchedule.Weekday.MONDAY
    start_time = datetime.time(10, 0)
    end_time = datetime.time(13, 0)
    slot_minutes = 20


class AppointmentFactory(factory.django.DjangoModelFactory):
    """A BOOKED scheduled appointment whose patient, doctor and booker share one clinic."""

    class Meta:
        model = Appointment

    clinic = factory.SubFactory(ClinicFactory)
    patient = factory.SubFactory(PatientProfileFactory, clinic=factory.SelfAttribute("..clinic"))
    doctor = factory.SubFactory(DoctorProfileFactory, clinic=factory.SelfAttribute("..clinic"))
    booked_by = factory.SubFactory(UserFactory, clinic=factory.SelfAttribute("..clinic"))
    # Each new appointment gets its own day, so two factory rows never clash on a slot.
    date = factory.Sequence(lambda n: datetime.date(2030, 1, 1) + datetime.timedelta(days=n))
    visit_type = Appointment.VisitType.SCHEDULED
    start_time = datetime.time(10, 0)
    end_time = datetime.time(10, 20)

    class Params:
        # AppointmentFactory(walk_in=True) makes a walk-in: no time, queue number 1.
        walk_in = factory.Trait(
            visit_type=Appointment.VisitType.WALK_IN,
            start_time=None,
            end_time=None,
            queue_number=1,
        )
