"""When doctors work (DoctorSchedule) and the visits booked with them (Appointment)."""

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
    """A patient's visit to a doctor at one time slot."""

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
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
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
        ordering = ["-date", "-start_time"]
        constraints = [
            # The database itself refuses a double booking. Cancelled appointments are
            # left out so that a cancelled slot can be booked again.
            models.UniqueConstraint(
                fields=["doctor", "date", "start_time"],
                condition=~Q(status="CANCELLED"),
                name="unique_active_appointment_slot",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.patient} with {self.doctor} on {self.date} at {self.start_time}"
