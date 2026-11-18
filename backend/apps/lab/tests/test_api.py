"""Tests for lab-tests/ and lab-orders/ through the API."""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.accounts.tests.factories import PatientProfileFactory, UserFactory
from apps.lab import services
from apps.lab.models import LabTest
from apps.lab.tests.factories import LabOrderFactory, LabTestFactory
from apps.scheduling.tests.factories import AppointmentFactory

LAB_TESTS = "/api/v1/lab-tests/"
LAB_ORDERS = "/api/v1/lab-orders/"
Role = User.Role
pytestmark = pytest.mark.django_db

CBC = {
    "name": "CBC",
    "price": "500.00",
    "category": "HEMATOLOGY REPORT",
    "specimen": "Whole Blood",
    "parameters": [
        {"name": "Hemoglobin (Hb)", "unit": "gm%", "reference_range": "11-16"},
        {
            "name": "Neutrophils",
            "unit": "%",
            "reference_range": "45-75",
            "section": "Differential Leucocyte Count",
        },
    ],
}


def pdf_file(name="result.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")


# ---------- lab tests ----------


@pytest.mark.parametrize("role", [Role.CLINIC_ADMIN, Role.LAB_TECHNICIAN])
def test_admin_and_lab_technician_create_a_test_with_rows(login_as, role) -> None:
    response = login_as(UserFactory(role=role)).post(LAB_TESTS, CBC, format="json")

    assert response.status_code == 201
    rows = response.data["parameters"]
    assert [(row["name"], row["position"]) for row in rows] == [
        ("Hemoglobin (Hb)", 0),
        ("Neutrophils", 1),
    ]
    assert rows[1]["section"] == "Differential Leucocyte Count"


def test_a_test_needs_at_least_one_row(login_as) -> None:
    response = login_as(UserFactory(role=Role.LAB_TECHNICIAN)).post(
        LAB_TESTS, {**CBC, "parameters": []}, format="json"
    )
    assert response.status_code == 400
    assert "parameters" in response.data


def test_duplicate_test_name_is_refused(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    LabTestFactory(clinic=lab_tech.clinic, name="CBC")
    response = login_as(lab_tech).post(LAB_TESTS, {**CBC, "name": "cbc"}, format="json")
    assert response.status_code == 400


def test_editing_a_test_replaces_its_rows(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    lab_test = LabTestFactory(clinic=lab_tech.clinic)
    response = login_as(lab_tech).patch(
        f"{LAB_TESTS}{lab_test.id}/",
        {"price": "350.00", "parameters": [{"name": "Only row", "unit": "%"}]},
        format="json",
    )
    assert response.status_code == 200
    assert [row["name"] for row in response.data["parameters"]] == ["Only row"]


@pytest.mark.parametrize("role", [Role.STAFF, Role.DOCTOR])
def test_staff_and_doctors_read_tests_only(login_as, role) -> None:
    user = UserFactory(role=role)
    lab_test = LabTestFactory(clinic=user.clinic)
    client = login_as(user)
    assert client.get(LAB_TESTS).status_code == 200
    assert client.post(LAB_TESTS, CBC, format="json").status_code == 403
    assert client.delete(f"{LAB_TESTS}{lab_test.id}/").status_code == 403


def test_pharmacist_cannot_see_lab_tests(login_as) -> None:
    assert login_as(UserFactory(role=Role.PHARMACIST)).get(LAB_TESTS).status_code == 403


def test_a_test_that_was_ordered_cannot_be_deleted(login_as) -> None:
    order = LabOrderFactory()
    admin = UserFactory(clinic=order.clinic, role=Role.CLINIC_ADMIN)
    lab_test = order.items.get().lab_test
    assert login_as(admin).delete(f"{LAB_TESTS}{lab_test.id}/").status_code == 409
    assert LabTest.objects.filter(pk=lab_test.pk).exists()


# ---------- lab orders ----------


def test_doctor_orders_from_own_visit(login_as) -> None:
    visit = AppointmentFactory()
    cbc = LabTestFactory(clinic=visit.clinic, name="CBC")

    response = login_as(visit.doctor.user).post(
        LAB_ORDERS, {"appointment": str(visit.id), "tests": [str(cbc.id)]}, format="json"
    )

    assert response.status_code == 201
    assert response.data["lab_number"] == 1
    assert response.data["consultant"] == f"Dr. {visit.doctor.user.get_full_name()}"
    assert response.data["items"][0]["lab_test_name"] == "CBC"
    assert len(response.data["items"][0]["parameters"]) == 2  # rows for the entry form


def test_lab_technician_orders_for_a_self_referred_patient(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    patient = PatientProfileFactory(clinic=lab_tech.clinic)
    lab_test = LabTestFactory(clinic=lab_tech.clinic)

    response = login_as(lab_tech).post(
        LAB_ORDERS, {"patient": str(patient.id), "tests": [str(lab_test.id)]}, format="json"
    )

    assert response.status_code == 201
    assert response.data["consultant"] == "Self"


@pytest.mark.parametrize("role", [Role.STAFF, Role.CLINIC_ADMIN, Role.PHARMACIST])
def test_other_roles_cannot_order_tests(login_as, role) -> None:
    user = UserFactory(role=role)
    patient = PatientProfileFactory(clinic=user.clinic)
    lab_test = LabTestFactory(clinic=user.clinic)
    response = login_as(user).post(
        LAB_ORDERS, {"patient": str(patient.id), "tests": [str(lab_test.id)]}, format="json"
    )
    assert response.status_code == 403


def test_tests_from_another_clinic_are_refused(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    patient = PatientProfileFactory(clinic=lab_tech.clinic)
    their_test = LabTestFactory()
    response = login_as(lab_tech).post(
        LAB_ORDERS, {"patient": str(patient.id), "tests": [str(their_test.id)]}, format="json"
    )
    assert response.status_code == 400
    assert "tests" in response.data


def test_lab_technician_collects_and_completes_with_a_file(login_as) -> None:
    order = LabOrderFactory()
    lab_tech = UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN)
    client = login_as(lab_tech)
    assert client.post(f"{LAB_ORDERS}{order.id}/collect/").data["status"] == "SAMPLE_COLLECTED"

    results = [
        {"parameter": str(p.id), "value": "12.5", "flag": "NORMAL"}
        for p in order.items.get().lab_test.parameters.all()
    ]
    # A file goes with multipart form data, so the results travel as JSON text.
    response = client.post(
        f"{LAB_ORDERS}{order.id}/complete/",
        {"results": json.dumps(results), "file": pdf_file()},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["status"] == "COMPLETED"
    assert response.data["file"].endswith(".pdf")
    assert [r["value"] for r in response.data["items"][0]["results"]] == ["12.5", "12.5"]


def test_complete_with_plain_json(login_as) -> None:
    order = LabOrderFactory()
    lab_tech = UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN)
    services.collect_sample(order, user=lab_tech)
    results = [
        {"parameter": str(p.id), "value": "Non-Reactive", "flag": "NORMAL"}
        for p in order.items.get().lab_test.parameters.all()
    ]
    response = login_as(lab_tech).post(
        f"{LAB_ORDERS}{order.id}/complete/", {"results": results}, format="json"
    )
    assert response.status_code == 200


@pytest.mark.parametrize(
    "results",
    [
        "not json",
        [{"parameter": "not-a-uuid", "value": "1", "flag": "NORMAL"}],
        [{"parameter": "00000000-0000-0000-0000-000000000000", "value": "", "flag": "NORMAL"}],
        [{"parameter": "00000000-0000-0000-0000-000000000000", "value": "1", "flag": "HIGH"}],
    ],
)
def test_badly_formed_results_are_refused(login_as, results) -> None:
    order = LabOrderFactory()
    lab_tech = UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN)
    services.collect_sample(order, user=lab_tech)
    response = login_as(lab_tech).post(
        f"{LAB_ORDERS}{order.id}/complete/", {"results": results}, format="json"
    )
    assert response.status_code == 400


def test_result_file_must_be_pdf_jpg_or_png(login_as) -> None:
    order = LabOrderFactory()
    lab_tech = UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN)
    services.collect_sample(order, user=lab_tech)
    response = login_as(lab_tech).post(
        f"{LAB_ORDERS}{order.id}/complete/",
        {"results": "[]", "file": SimpleUploadedFile("virus.exe", b"MZ...")},
        format="multipart",
    )
    assert response.status_code == 400
    assert "file" in response.data


def test_cancel_needs_a_reason(login_as) -> None:
    order = LabOrderFactory()
    client = login_as(UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN))
    assert client.post(f"{LAB_ORDERS}{order.id}/cancel/", {}).status_code == 400
    assert client.post(f"{LAB_ORDERS}{order.id}/cancel/", {"reason": "Left"}).status_code == 200


@pytest.mark.parametrize("role", [Role.STAFF, Role.CLINIC_ADMIN, Role.DOCTOR])
def test_only_lab_technicians_move_orders_forward(login_as, role) -> None:
    order = LabOrderFactory()
    user = (
        order.appointment.doctor.user
        if role == Role.DOCTOR
        else UserFactory(clinic=order.clinic, role=role)
    )
    client = login_as(user)
    assert client.get(f"{LAB_ORDERS}{order.id}/").status_code == 200  # they may look
    for step in ("collect", "cancel"):
        assert client.post(f"{LAB_ORDERS}{order.id}/{step}/", {"reason": "x"}).status_code == 403


def test_pharmacist_cannot_see_lab_orders(login_as) -> None:
    assert login_as(UserFactory(role=Role.PHARMACIST)).get(LAB_ORDERS).status_code == 403


def test_doctor_sees_lab_orders_of_own_patients_only(login_as) -> None:
    mine = LabOrderFactory()
    doctor = mine.appointment.doctor
    self_referred_patient_of_mine = LabOrderFactory(
        clinic=mine.clinic, appointment=None, patient=mine.patient
    )
    stranger = LabOrderFactory(clinic=mine.clinic)

    ids = {row["id"] for row in login_as(doctor.user).get(LAB_ORDERS).data["results"]}

    assert ids == {str(mine.id), str(self_referred_patient_of_mine.id)}
    assert str(stranger.id) not in ids


def test_lab_orders_cannot_be_edited_or_deleted(login_as) -> None:
    order = LabOrderFactory()
    client = login_as(UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN))
    assert client.patch(f"{LAB_ORDERS}{order.id}/", {"status": "COMPLETED"}).status_code == 405
    assert client.delete(f"{LAB_ORDERS}{order.id}/").status_code == 405
