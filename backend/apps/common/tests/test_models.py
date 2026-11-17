"""Tests for rules that every model in the project must follow."""

import pytest
from django.apps import apps
from django.db import models

from apps.billing.tests.factories import InvoiceFactory, InvoiceItemFactory
from apps.common.models import TenantModel
from apps.common.tests.factories import AuditLogFactory
from apps.lab.tests.factories import LabOrderFactory
from apps.pharmacy.tests.factories import StockMovementFactory
from apps.records.tests.factories import DocumentFactory, PrescriptionItemFactory
from apps.scheduling.tests.factories import DoctorScheduleFactory

PROJECT_MODELS = [m for m in apps.get_models() if m.__module__.startswith("apps.")]


@pytest.mark.parametrize("model", PROJECT_MODELS, ids=lambda m: m.__name__)
def test_model_has_uuid_key_and_timestamps(model) -> None:
    """Every table uses a UUID primary key and created_at / updated_at."""
    assert isinstance(model._meta.pk, models.UUIDField)
    field_names = {field.name for field in model._meta.get_fields()}
    assert {"created_at", "updated_at"} <= field_names


def test_tenant_models_are_the_expected_ones() -> None:
    """Guards the list of clinic-owned tables, so a new one cannot skip the clinic column."""
    tenant_models = {m.__name__ for m in PROJECT_MODELS if issubclass(m, TenantModel)}
    assert tenant_models == {
        "AuditLog",
        "Department",
        "PatientProfile",
        "DoctorSchedule",
        "Appointment",
        "Prescription",
        "Document",
        "Medicine",
        "MedicineBatch",
        "StockMovement",
        "LabTest",
        "LabOrder",
        "Invoice",
    }


@pytest.mark.django_db
def test_factories_keep_related_objects_in_one_clinic() -> None:
    """Factories must build realistic data: everything linked together shares a clinic."""
    schedule = DoctorScheduleFactory()
    assert schedule.doctor.user.clinic == schedule.clinic
    assert schedule.doctor.department.clinic == schedule.clinic

    item = PrescriptionItemFactory()
    prescription = item.prescription
    assert item.medicine.clinic == prescription.clinic
    assert prescription.appointment.clinic == prescription.clinic
    assert prescription.appointment.patient.clinic == prescription.clinic
    assert prescription.appointment.doctor.user.clinic == prescription.clinic

    movement = StockMovementFactory()
    assert movement.batch.clinic == movement.clinic
    assert movement.batch.medicine.clinic == movement.clinic
    assert movement.created_by.clinic == movement.clinic

    order = LabOrderFactory()
    assert order.patient == order.appointment.patient
    assert order.lab_test.clinic == order.clinic

    invoice = InvoiceItemFactory().invoice
    assert invoice.patient.clinic == invoice.clinic

    document = DocumentFactory()
    assert document.patient.clinic == document.clinic

    log = AuditLogFactory()
    assert log.user.clinic == log.clinic


@pytest.mark.django_db
def test_two_factory_objects_get_different_clinics() -> None:
    """Separate factory calls make separate tenants, which the isolation tests rely on."""
    assert InvoiceFactory().clinic != InvoiceFactory().clinic
