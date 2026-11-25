"""Tests for the returning-patient history (phase 12): patients/<id>/history/ and the
previous_visits count on each visit."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tests.factories import PatientProfileFactory, UserFactory
from apps.lab.models import LabOrder, LabResult
from apps.lab.tests.factories import LabOrderFactory, LabTestFactory
from apps.records.tests.factories import PrescriptionFactory, PrescriptionItemFactory
from apps.scheduling.models import Appointment
from apps.scheduling.tests.factories import AppointmentFactory

pytestmark = pytest.mark.django_db
Role = User.Role
COMPLETED = Appointment.Status.COMPLETED


def history_url(patient) -> str:
    return f"/api/v1/patients/{patient.id}/history/"


def seen_visit(patient, doctor=None, days_ago=0, **extra) -> Appointment:
    """A completed visit of the patient, `days_ago` days back."""
    fields = {"clinic": patient.clinic, "patient": patient, "status": COMPLETED}
    if doctor is not None:
        fields["doctor"] = doctor
    fields["date"] = timezone.localdate() - datetime.timedelta(days=days_ago)
    return AppointmentFactory(**fields, **extra)


def blood_sugar(patient, value: str, days_ago: int, flag: str = "ABNORMAL") -> None:
    """A completed lab order with one Random Blood Sugar result."""
    test = LabTestFactory(clinic=patient.clinic, name=f"RBS {days_ago}")
    order = LabOrderFactory(clinic=patient.clinic, appointment=None, patient=patient, tests=[test])
    LabOrder.objects.filter(pk=order.pk).update(
        status=LabOrder.Status.COMPLETED,
        completed_at=timezone.now() - datetime.timedelta(days=days_ago),
    )
    LabResult.objects.create(
        item=order.items.get(),
        name="Random Blood Sugar",
        unit="mg/dl",
        reference_range="70-140",
        value=value,
        flag=flag,
    )


def test_history_shows_visits_diagnoses_medicines_and_lab_trends(login_as) -> None:
    patient = PatientProfileFactory()
    first = seen_visit(patient, days_ago=60)
    PrescriptionFactory(clinic=patient.clinic, appointment=first, diagnosis="Type 2 diabetes")
    last = seen_visit(patient, doctor=first.doctor, days_ago=2)
    latest = PrescriptionFactory(
        clinic=patient.clinic, appointment=last, diagnosis="Diabetes, better"
    )
    PrescriptionItemFactory(prescription=latest, dosage="1 tablet", frequency="twice a day")
    for value, days in (("210", 60), ("182", 30), ("140", 2)):
        blood_sugar(patient, value, days)
    blood_sugar(patient, "Non-Reactive", 1)  # text: not a number, not in a trend

    data = login_as(first.doctor.user).get(history_url(patient)).data

    assert data["visits"]["count"] == 2
    assert [row["diagnosis"] for row in data["recent_visits"]] == [
        "Diabetes, better",
        "Type 2 diabetes",
    ]
    assert data["current_medicines"]["diagnosis"] == "Diabetes, better"
    assert data["current_medicines"]["items"][0]["frequency"] == "twice a day"
    [trend] = data["lab_trends"]
    assert (trend["name"], trend["unit"]) == ("Random Blood Sugar", "mg/dl")
    assert [point["value"] for point in trend["points"]] == [210.0, 182.0, 140.0]


def test_a_new_patient_has_an_empty_history(login_as) -> None:
    patient = PatientProfileFactory()
    staff = UserFactory(clinic=patient.clinic, role=Role.STAFF)
    data = login_as(staff).get(history_url(patient)).data
    assert data == {
        "visits": {"count": 0, "first": None, "last": None},
        "recent_visits": [],
        "current_medicines": None,
        "lab_trends": [],
    }


def test_a_doctor_only_reaches_their_own_patients_history(login_as) -> None:
    mine = seen_visit(PatientProfileFactory())
    stranger = PatientProfileFactory(clinic=mine.clinic)  # no visit with this doctor
    client = login_as(mine.doctor.user)
    assert client.get(history_url(mine.patient)).status_code == 200
    assert client.get(history_url(stranger)).status_code == 404


def test_the_lab_does_not_see_diagnoses(login_as) -> None:
    patient = PatientProfileFactory()
    lab = UserFactory(clinic=patient.clinic, role=Role.LAB_TECHNICIAN)
    assert login_as(lab).get(history_url(patient)).status_code == 403


def test_each_visit_says_how_many_times_the_patient_came_before(login_as) -> None:
    """The queue marks returning patients; other doctors' visits count too."""
    patient = PatientProfileFactory()
    seen_visit(patient, days_ago=30)
    seen_visit(patient, days_ago=10)
    AppointmentFactory(clinic=patient.clinic, patient=patient, status=Appointment.Status.CANCELLED)
    today = AppointmentFactory(clinic=patient.clinic, patient=patient, date=timezone.localdate())
    newcomer = AppointmentFactory(clinic=patient.clinic, date=timezone.localdate())
    staff = login_as(UserFactory(clinic=patient.clinic, role=Role.STAFF))

    rows = staff.get("/api/v1/appointments/", {"date": timezone.localdate().isoformat()}).data
    counts = {row["id"]: row["previous_visits"] for row in rows["results"]}

    assert counts[str(today.id)] == 2
    assert counts[str(newcomer.id)] == 0
    single = staff.get(f"/api/v1/appointments/{today.id}/").data
    assert single["previous_visits"] == 2
