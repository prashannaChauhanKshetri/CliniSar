"""Serializers for doctor schedules, slots and appointments."""

import datetime

from rest_framework import serializers

from apps.accounts.models import DoctorProfile, PatientProfile
from apps.common.serializers import TenantPrimaryKeyRelatedField

from .models import Appointment, DoctorSchedule


def minutes_between(start: datetime.time, end: datetime.time) -> int:
    """Length of a time range in minutes (both times on the same day)."""
    return (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)


class DoctorScheduleSerializer(serializers.ModelSerializer):
    """One block of a doctor's weekly working hours. The doctor comes from the URL."""

    weekday_name = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = DoctorSchedule
        fields = ["id", "weekday", "weekday_name", "start_time", "end_time", "slot_minutes"]
        extra_kwargs = {"slot_minutes": {"min_value": 5, "max_value": 240}}
        # The unique check is replaced by the clearer overlap check in validate().
        validators = []

    def validate(self, data: dict) -> dict:
        """Start before end, room for at least one slot, no overlap with other blocks."""
        current = self.instance
        weekday = data.get("weekday", getattr(current, "weekday", None))
        start = data.get("start_time", getattr(current, "start_time", None))
        end = data.get("end_time", getattr(current, "end_time", None))
        slot_minutes = data.get("slot_minutes", getattr(current, "slot_minutes", 20))

        if start >= end:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})
        if minutes_between(start, end) < slot_minutes:
            raise serializers.ValidationError(
                {"slot_minutes": "The working hours are shorter than one slot."}
            )

        # Two blocks overlap when each one starts before the other one ends.
        overlapping = DoctorSchedule.objects.filter(
            doctor=self.context["doctor"], weekday=weekday, start_time__lt=end, end_time__gt=start
        )
        if current:
            overlapping = overlapping.exclude(pk=current.pk)
        if overlapping.exists():
            raise serializers.ValidationError(
                "These hours overlap another block of the same doctor on that day."
            )
        return data


class SlotSerializer(serializers.Serializer):
    """A free slot returned by GET doctors/<id>/slots/."""

    start_time = serializers.TimeField()
    end_time = serializers.TimeField()


class AppointmentSerializer(serializers.ModelSerializer):
    """An appointment as shown in lists and detail pages (read only)."""

    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    doctor_name = serializers.CharField(source="doctor.user.get_full_name", read_only=True)
    department_name = serializers.CharField(
        source="doctor.department.name", read_only=True, allow_null=True
    )
    previous_visits = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id",
            "visit_type",
            "patient",
            "patient_name",
            "doctor",
            "doctor_name",
            "department_name",
            "date",
            "start_time",
            "end_time",
            "queue_number",
            "status",
            "reason",
            "cancel_reason",
            "cancelled_by",
            "booked_by",
            "created_at",
            "previous_visits",
        ]
        read_only_fields = fields

    def get_previous_visits(self, appointment: Appointment) -> int:
        """Completed visits of this patient before (any doctor): 0 = first time here.

        NP: Patient pahila kati choti aaisakyo; 0 bhaye naya patient, natra "returning".
        Lists annotate it in one query (AppointmentViewSet); a single visit counts here.
        """
        annotated = getattr(appointment, "previous_visits", None)
        if annotated is not None:
            return annotated
        return (
            Appointment.objects.filter(
                patient_id=appointment.patient_id, status=Appointment.Status.COMPLETED
            )
            .exclude(pk=appointment.pk)
            .count()
        )


class AppointmentCreateSerializer(serializers.Serializer):
    """Input of POST appointments/.

    SCHEDULED needs a date and start_time (the slot). WALK_IN needs neither: it is
    always for today and gets the next queue number.
    """

    visit_type = serializers.ChoiceField(
        choices=Appointment.VisitType.choices, default=Appointment.VisitType.SCHEDULED
    )
    # Both must belong to the requester's clinic.
    patient = TenantPrimaryKeyRelatedField(queryset=PatientProfile.objects.all())
    doctor = TenantPrimaryKeyRelatedField(
        queryset=DoctorProfile.objects.select_related("user"), tenant_field="user__clinic"
    )
    date = serializers.DateField(required=False)
    start_time = serializers.TimeField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, data: dict) -> dict:
        if data["visit_type"] == Appointment.VisitType.SCHEDULED:
            missing = {
                field: "This field is required for a scheduled visit."
                for field in ("date", "start_time")
                if field not in data
            }
            if missing:
                raise serializers.ValidationError(missing)
        return data


class CancelAppointmentSerializer(serializers.Serializer):
    """Input of POST appointments/<id>/cancel/."""

    reason = serializers.CharField()
