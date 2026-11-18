"""Tests that important actions leave a row in the audit log."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.accounts.tests.factories import PatientProfileFactory, UserFactory
from apps.billing.tests.factories import InvoiceFactory
from apps.common.models import AuditLog
from apps.lab.tests.factories import LabOrderFactory
from apps.records.tests.factories import DocumentFactory
from apps.scheduling.tests.factories import AppointmentFactory

Role = User.Role
pytestmark = pytest.mark.django_db


def log_rows() -> list[tuple]:
    return list(AuditLog.objects.order_by("created_at").values_list("action", "model_name"))


def test_walk_in_cancel_and_complete_are_logged(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    visit = AppointmentFactory(clinic=staff.clinic)
    patient = PatientProfileFactory(clinic=staff.clinic)
    client = login_as(staff)

    created = client.post(
        "/api/v1/appointments/",
        {"visit_type": "WALK_IN", "patient": str(patient.id), "doctor": str(visit.doctor.id)},
    )
    client.post(f"/api/v1/appointments/{created.data['id']}/cancel/", {"reason": "x"})
    client.post(f"/api/v1/appointments/{visit.id}/complete/")

    assert log_rows() == [
        ("CREATE", "Appointment"),
        ("UPDATE", "Appointment"),
        ("UPDATE", "Appointment"),
    ]
    entry = AuditLog.objects.order_by("created_at").first()  # the CREATE row
    assert (entry.user, entry.clinic, str(entry.object_id)) == (
        staff,
        staff.clinic,
        created.data["id"],
    )


def test_paying_an_invoice_is_logged(login_as) -> None:
    invoice = InvoiceFactory()
    staff = UserFactory(clinic=invoice.clinic, role=Role.STAFF)
    login_as(staff).post(f"/api/v1/invoices/{invoice.id}/pay/", {"payment_method": "CASH"})
    assert log_rows() == [("UPDATE", "Invoice")]


def test_lab_order_steps_are_logged(login_as) -> None:
    order = LabOrderFactory()
    lab_tech = UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN)
    login_as(lab_tech).post(f"/api/v1/lab-orders/{order.id}/collect/")
    assert log_rows() == [("UPDATE", "LabOrder")]


def test_document_upload_and_delete_are_logged(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    patient = PatientProfileFactory(clinic=staff.clinic)
    old = DocumentFactory(clinic=staff.clinic)
    client = login_as(staff)

    client.post(
        "/api/v1/documents/",
        {
            "patient": str(patient.id),
            "title": "Scan",
            "file": SimpleUploadedFile("a.pdf", b"%PDF-1.4"),
        },
        format="multipart",
    )
    client.delete(f"/api/v1/documents/{old.id}/")

    assert log_rows() == [("CREATE", "Document"), ("DELETE", "Document")]
    assert AuditLog.objects.filter(action="DELETE", object_id=old.id).exists()


def test_refused_requests_leave_no_audit_row(login_as) -> None:
    visit = AppointmentFactory(status="CANCELLED")
    staff = UserFactory(clinic=visit.clinic, role=Role.STAFF)
    login_as(staff).post(f"/api/v1/appointments/{visit.id}/complete/")  # 400
    assert AuditLog.objects.count() == 0
