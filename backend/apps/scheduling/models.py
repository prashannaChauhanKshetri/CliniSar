"""When doctors work (DoctorSchedule) and the visits patients make to them (Appointment)."""

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.common.models import TenantModel


class DoctorSchedule(TenantModel):
    """One block of working hours for a doctor on a weekday. Slots are calculated from it."""

    class Weekday(models.IntegerChoices):
        # Same numbering as Python's date.weekday(), so no conversion is ever needed.
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    doctor = models.ForeignKey(
        "accounts.DoctorProfile", on_delete=models.CASCADE, related_name="schedules"
    )
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField(default=20)

    class Meta:
        ordering = ["weekday", "start_time"]
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "weekday", "start_time"], name="unique_schedule_start"
            ),
            models.CheckConstraint(
                condition=Q(start_time__lt=F("end_time")), name="schedule_start_before_end"
            ),
            models.CheckConstraint(
                condition=Q(slot_minutes__gt=0), name="schedule_slot_minutes_positive"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.doctor} {self.get_weekday_display()} {self.start_time}-{self.end_time}"


class Appointment(TenantModel):
    """A patient's visit to a doctor: a booked time slot, or a walk-in with a queue number."""

    class VisitType(models.TextChoices):
        # Booked in advance for a time slot calculated from the doctor's schedule.
        SCHEDULED = "SCHEDULED", "Scheduled"
        # Came in today without a booking; gets the next number in the doctor's queue.
        WALK_IN = "WALK_IN", "Walk-in"

    class Status(models.TextChoices):
        BOOKED = "BOOKED", "Booked"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        NO_SHOW = "NO_SHOW", "No show"

    patient = models.ForeignKey(
        "accounts.PatientProfile", on_delete=models.PROTECT, related_name="appointments"
    )
    doctor = models.ForeignKey(
        "accounts.DoctorProfile", on_delete=models.PROTECT, related_name="appointments"
    )
    visit_type = models.CharField(
        max_length=10, choices=VisitType.choices, default=VisitType.SCHEDULED
    )
    date = models.DateField()
    # Set for SCHEDULED visits only.
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    # Set for WALK_IN visits only: 1, 2, 3 ... per doctor per day.
    queue_number = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.BOOKED)
    reason = models.TextField(blank=True)
    cancel_reason = models.TextField(blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="appointments_cancelled",
    )
    booked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="appointments_booked"
    )

    class Meta:
        # Newest day first; inside a day, by time and then by queue number.
        ordering = ["-date", "start_time", "queue_number"]
        constraints = [
            # The database itself refuses a double booking. Cancelled appointments are
            # left out so that a cancelled slot can be booked again.
            models.UniqueConstraint(
                fields=["doctor", "date", "start_time"],
                condition=~Q(status="CANCELLED"),
                name="unique_active_appointment_slot",
            ),
            # Two walk-ins of one doctor on one day never share a queue number.
            models.UniqueConstraint(
                fields=["doctor", "date", "queue_number"], name="unique_queue_number"
            ),
            # A scheduled visit has a time and no queue number; a walk-in the opposite.
            models.CheckConstraint(
                condition=(
                    Q(
                        visit_type="SCHEDULED",
                        start_time__isnull=False,
                        end_time__isnull=False,
                        queue_number__isnull=True,
                        start_time__lt=F("end_time"),
                    )
                    | Q(
                        visit_type="WALK_IN",
                        start_time__isnull=True,
                        end_time__isnull=True,
                        queue_number__isnull=False,
                    )
                ),
                name="appointment_time_or_queue_number",
            ),
        ]

    def __str__(self) -> str:
        when = self.start_time if self.start_time else f"queue #{self.queue_number}"
        return f"{self.patient} with {self.doctor} on {self.date} ({when})"
