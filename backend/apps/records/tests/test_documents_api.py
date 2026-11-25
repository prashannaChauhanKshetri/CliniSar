"""Tests for documents/: uploading, file checks, who may see and delete."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.accounts.tests.factories import PatientProfileFactory, UserFactory
from apps.records.models import Document
from apps.records.tests.factories import DocumentFactory
from apps.scheduling.tests.factories import AppointmentFactory

DOCUMENTS = "/api/v1/documents/"
Role = User.Role
pytestmark = pytest.mark.django_db

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 20


def upload(client, patient, file):
    return client.post(
        DOCUMENTS,
        {"patient": str(patient.id), "title": "Old X-ray", "file": file},
        format="multipart",
    )


@pytest.mark.parametrize("role", [Role.STAFF, Role.CLINIC_ADMIN])
def test_staff_uploads_a_document_for_a_patient(login_as, role) -> None:
    user = UserFactory(role=role)
    patient = PatientProfileFactory(clinic=user.clinic)

    response = upload(login_as(user), patient, SimpleUploadedFile("xray.png", PNG))

    assert response.status_code == 201
    assert response.data["uploaded_by_name"] == user.get_full_name()
    assert response.data["patient_name"] == patient.full_name
    document = Document.objects.get(id=response.data["id"])
    assert (document.clinic, document.uploaded_by) == (user.clinic, user)


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("notes.txt", b"plain text"),  # type not allowed
        ("report.pdf", b"MZ\x90\x00 a program"),  # a .pdf that is not a PDF
        ("photo.jpg", PNG),  # PNG content with a .jpg name
    ],
)
def test_only_real_pdf_jpg_and_png_files_are_accepted(login_as, name, content) -> None:
    staff = UserFactory(role=Role.STAFF)
    patient = PatientProfileFactory(clinic=staff.clinic)
    response = upload(login_as(staff), patient, SimpleUploadedFile(name, content))
    assert response.status_code == 400
    assert "file" in response.data
    assert not Document.objects.exists()


def test_files_over_10_mb_are_refused(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    patient = PatientProfileFactory(clinic=staff.clinic)
    too_big = SimpleUploadedFile("scan.pdf", b"%PDF" + b"0" * (10 * 1024 * 1024))
    response = upload(login_as(staff), patient, too_big)
    assert response.status_code == 400
    assert "10 MB" in str(response.data["file"])


def test_patient_from_another_clinic_is_refused(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    their_patient = PatientProfileFactory()
    response = upload(login_as(staff), their_patient, SimpleUploadedFile("a.png", PNG))
    assert response.status_code == 400


def test_staff_deletes_a_document(login_as) -> None:
    document = DocumentFactory()
    staff = UserFactory(clinic=document.clinic, role=Role.STAFF)
    assert login_as(staff).delete(f"{DOCUMENTS}{document.id}/").status_code == 204
    assert not Document.objects.exists()


def test_documents_cannot_be_edited(login_as) -> None:
    document = DocumentFactory()
    staff = UserFactory(clinic=document.clinic, role=Role.STAFF)
    assert login_as(staff).patch(f"{DOCUMENTS}{document.id}/", {"title": "x"}).status_code == 405


def test_doctor_reads_documents_of_own_patients_only(login_as) -> None:
    visit = AppointmentFactory()
    mine = DocumentFactory(clinic=visit.clinic, patient=visit.patient)
    stranger = DocumentFactory(clinic=visit.clinic)
    client = login_as(visit.doctor.user)

    ids = {row["id"] for row in client.get(DOCUMENTS).data["results"]}

    assert ids == {str(mine.id)}
    assert client.get(f"{DOCUMENTS}{stranger.id}/").status_code == 404
    assert client.delete(f"{DOCUMENTS}{mine.id}/").status_code == 403
    assert upload(client, visit.patient, SimpleUploadedFile("a.png", PNG)).status_code == 403


@pytest.mark.parametrize("role", [Role.LAB_TECHNICIAN])
def test_lab_cannot_see_documents(login_as, role) -> None:
    assert login_as(UserFactory(role=role)).get(DOCUMENTS).status_code == 403


def test_list_can_be_filtered_by_patient(login_as) -> None:
    document = DocumentFactory()
    DocumentFactory(clinic=document.clinic)
    staff = UserFactory(clinic=document.clinic, role=Role.STAFF)
    rows = login_as(staff).get(DOCUMENTS, {"patient": str(document.patient.id)}).data["results"]
    assert [row["id"] for row in rows] == [str(document.id)]
