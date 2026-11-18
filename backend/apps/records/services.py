"""Business rules for prescriptions."""

from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.common.exceptions import Conflict
from apps.scheduling.models import Appointment

from .models import Prescription, PrescriptionItem


def check_can_prescribe(appointment: Appointment, doctor_user: User) -> None:
    """Only the visit's own doctor, only for a visit that was not cancelled, only once."""
    if appointment.doctor.user_id != doctor_user.id:
        raise ValidationError({"appointment": "You can only prescribe for your own appointments."})
    if appointment.status in (Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW):
        raise ValidationError({"appointment": f"This appointment is {appointment.status}."})
    if Prescription.objects.filter(appointment=appointment).exists():
        raise ValidationError({"appointment": "This appointment already has a prescription."})


def create_prescription(
    *, appointment: Appointment, doctor_user: User, diagnosis: str, notes: str, items: list[dict]
) -> Prescription:
    """Create a PENDING prescription with its medicine lines in one transaction."""
    check_can_prescribe(appointment, doctor_user)
    try:
        with transaction.atomic():
            prescription = Prescription.objects.create(
                clinic=appointment.clinic,
                appointment=appointment,
                diagnosis=diagnosis,
                notes=notes,
            )
            PrescriptionItem.objects.bulk_create(
                PrescriptionItem(prescription=prescription, **item) for item in items
            )
    except IntegrityError as error:  # two requests for the same appointment at once
        raise Conflict("This appointment already has a prescription.") from error
    return prescription
