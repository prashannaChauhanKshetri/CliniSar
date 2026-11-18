"""Business rules for the lab: test parameters, ordering, Lab No., status steps, results.

Status only moves ORDERED -> SAMPLE_COLLECTED -> COMPLETED. CANCELLED is allowed
only from ORDERED. Any other change is refused with a 400.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import PatientProfile, User
from apps.billing import services as billing
from apps.clinics.models import Clinic
from apps.scheduling.models import Appointment

from .models import LabOrder, LabOrderItem, LabResult, LabTest, LabTestParameter

Status = LabOrder.Status


# ---------- test parameters ----------


@transaction.atomic
def save_parameters(lab_test: LabTest, rows: list[dict]) -> None:
    """Make the test's parameters exactly match `rows`.

    Rows with an id update that parameter, rows without one are added, and
    parameters missing from `rows` are removed. Finished reports are not affected:
    their results keep their own copies of name, unit and range.
    """
    keep_ids = []
    for position, row in enumerate(rows):
        row = {**row, "position": position}
        parameter_id = row.pop("id", None)
        if parameter_id:
            parameter = lab_test.parameters.filter(pk=parameter_id).first()
            if parameter is None:
                raise ValidationError({"parameters": f"Unknown parameter {parameter_id}."})
            for field, value in row.items():
                setattr(parameter, field, value)
            parameter.save()
        else:
            parameter = LabTestParameter.objects.create(lab_test=lab_test, **row)
        keep_ids.append(parameter.pk)
    lab_test.parameters.exclude(pk__in=keep_ids).delete()


# ---------- ordering ----------


def take_next_lab_number(clinic: Clinic) -> int:
    """Lock the clinic row and take the next Lab No. (same idea as invoice numbers)."""
    locked = Clinic.objects.select_for_update().get(pk=clinic.pk)
    locked.last_lab_order_number += 1
    locked.save(update_fields=["last_lab_order_number", "updated_at"])
    return locked.last_lab_order_number


def check_tests(tests: list[LabTest]) -> None:
    if not tests:
        raise ValidationError({"tests": "Choose at least one test."})
    if len({test.pk for test in tests}) != len(tests):
        raise ValidationError({"tests": "Each test may appear only once."})
    inactive = [test.name for test in tests if not test.is_active]
    if inactive:
        raise ValidationError({"tests": f"No longer offered: {', '.join(inactive)}."})


def resolve_patient(
    patient: PatientProfile | None, appointment: Appointment | None, ordered_by: User
) -> PatientProfile:
    """Work out the patient and check who may order.

    A doctor orders from their own visit. Lab staff may also order for a patient who
    came on their own (no visit): the report then says "Consultant: Self".
    """
    if appointment is None:
        if ordered_by.role == User.Role.DOCTOR:
            raise ValidationError({"appointment": "Doctors order tests from a visit."})
        if patient is None:
            raise ValidationError({"patient": "Choose the patient."})
        return patient

    if ordered_by.role == User.Role.DOCTOR and appointment.doctor.user_id != ordered_by.id:
        raise ValidationError({"appointment": "You can only order tests for your own visits."})
    if appointment.status in (Appointment.Status.CANCELLED, Appointment.Status.NO_SHOW):
        raise ValidationError({"appointment": f"This appointment is {appointment.status}."})
    if patient is not None and patient.pk != appointment.patient_id:
        raise ValidationError({"patient": "This is not the patient of that visit."})
    return appointment.patient


@transaction.atomic
def create_lab_order(
    *,
    clinic: Clinic,
    tests: list[LabTest],
    ordered_by: User,
    patient: PatientProfile | None = None,
    appointment: Appointment | None = None,
) -> LabOrder:
    """Create the order with its tests, its Lab No. and its LAB bill, all together."""
    check_tests(tests)
    patient = resolve_patient(patient, appointment, ordered_by)
    order = LabOrder.objects.create(
        clinic=clinic,
        lab_number=take_next_lab_number(clinic),
        patient=patient,
        appointment=appointment,
        ordered_by=ordered_by,
    )
    LabOrderItem.objects.bulk_create(LabOrderItem(order=order, lab_test=test) for test in tests)
    billing.create_invoice(
        clinic=clinic,
        patient=patient,
        source=billing.Source.LAB,
        lines=[billing.Line(test.name, 1, test.price) for test in tests],
        lab_order=order,
    )
    return order


# ---------- status steps ----------


def lock_in_status(order: LabOrder, expected: str, action: str) -> LabOrder:
    """Re-read the order with a row lock and check it is in the status this step needs."""
    locked = LabOrder.objects.select_for_update().get(pk=order.pk)
    if locked.status != expected:
        raise ValidationError(
            {"status": f"Cannot {action} an order that is {locked.status}; it must be {expected}."}
        )
    return locked


@transaction.atomic
def collect_sample(order: LabOrder, *, user: User) -> LabOrder:
    """ORDERED -> SAMPLE_COLLECTED, recording who took the sample and when."""
    locked = lock_in_status(order, Status.ORDERED, "collect a sample for")
    locked.status = Status.SAMPLE_COLLECTED
    locked.collected_at = timezone.now()
    locked.collected_by = user
    locked.save(update_fields=["status", "collected_at", "collected_by", "updated_at"])
    return locked


@transaction.atomic
def cancel_lab_order(order: LabOrder, *, reason: str) -> LabOrder:
    """ORDERED -> CANCELLED (only before the sample is taken); cancels the bill if unpaid."""
    locked = lock_in_status(order, Status.ORDERED, "cancel")
    locked.status = Status.CANCELLED
    locked.cancel_reason = reason
    locked.save(update_fields=["status", "cancel_reason", "updated_at"])
    invoice = getattr(locked, "invoice", None)
    billing.cancel_unpaid_invoice_of(invoice, reason=f"Lab order cancelled: {reason}")
    return locked


def match_results(order: LabOrder, results: list[dict]) -> list[tuple]:
    """Pair every parameter of every test in the order with its submitted result.

    Every parameter needs exactly one result; anything missing or unknown is a 400.
    Returns (item, parameter, result) tuples.
    """
    by_parameter = {str(result["parameter"]): result for result in results}
    if len(by_parameter) != len(results):
        raise ValidationError({"results": "Each parameter may appear only once."})

    pairs, missing = [], []
    for item in order.items.select_related("lab_test").prefetch_related("lab_test__parameters"):
        for parameter in item.lab_test.parameters.all():
            result = by_parameter.pop(str(parameter.pk), None)
            if result is None:
                missing.append(f"{item.lab_test.name}: {parameter.name}")
            else:
                pairs.append((item, parameter, result))
    if missing:
        raise ValidationError({"results": f"Results are missing for {', '.join(missing)}."})
    if by_parameter:
        raise ValidationError({"results": "Some results are not for the tests of this order."})
    return pairs


@transaction.atomic
def complete_lab_order(order: LabOrder, *, user: User, results: list[dict], file=None) -> LabOrder:
    """SAMPLE_COLLECTED -> COMPLETED with a value and flag for every parameter."""
    locked = lock_in_status(order, Status.SAMPLE_COLLECTED, "complete")
    LabResult.objects.bulk_create(
        LabResult(
            item=item,
            parameter=parameter,
            name=parameter.name,
            unit=parameter.unit,
            reference_range=parameter.reference_range,
            section=parameter.section,
            position=parameter.position,
            value=result["value"],
            flag=result["flag"],
        )
        for item, parameter, result in match_results(locked, results)
    )
    locked.status = Status.COMPLETED
    locked.completed_by = user
    locked.completed_at = timezone.now()
    if file is not None:
        locked.file = file
    locked.save()
    return locked
