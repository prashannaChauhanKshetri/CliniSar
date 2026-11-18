"""Tests for the seed_demo management command."""

from io import StringIO

import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.clinics.models import Clinic
from apps.common.management.commands import seed_demo
from apps.lab.models import LabOrder, LabTest
from apps.pharmacy.models import Medicine, MedicineBatch
from apps.records.models import Prescription
from apps.scheduling.models import Appointment

pytestmark = pytest.mark.django_db


def run_seed() -> str:
    out = StringIO()
    call_command("seed_demo", stdout=out)
    return out.getvalue()


def test_seed_creates_two_clinics_with_every_role() -> None:
    output = run_seed()

    assert Clinic.objects.count() == 2
    for clinic in Clinic.objects.all():
        roles = set(User.objects.filter(clinic=clinic).values_list("role", flat=True))
        assert roles == {"CLINIC_ADMIN", "STAFF", "DOCTOR", "PHARMACIST", "LAB_TECHNICIAN"}
        assert clinic.users.filter(role="DOCTOR").count() == 3
        assert clinic.patientprofile_set.count() == 10
    assert "admin@sunrise.demo" in output
    assert "demo-pass-123" in output


def test_seed_visits_all_have_bills() -> None:
    run_seed()
    visits = Appointment.objects.count()
    assert visits > 0
    assert Invoice.objects.filter(source="CONSULTATION").count() == visits
    assert Invoice.objects.filter(status="PAID").exists()
    assert Invoice.objects.filter(status="UNPAID").exists()


def test_seed_users_can_log_in(client) -> None:
    run_seed()
    response = client.post(
        "/api/v1/auth/login/",
        {"email": "staff@sunrise.demo", "password": "demo-pass-123"},
        content_type="application/json",
    )
    assert response.status_code == 200


def test_seed_pharmacy_has_soon_expiring_expired_and_low_stock() -> None:
    run_seed()
    for clinic in Clinic.objects.all():
        batches = MedicineBatch.objects.filter(clinic=clinic)
        assert batches.filter(batch_number="AMX-201").exists()  # expires within 90 days
        assert batches.get(batch_number="CTZ-301").quantity == 40  # expired, never used
        syrup = Medicine.objects.with_available_stock().get(clinic=clinic, name="Cough Syrup")
        assert syrup.available_stock <= syrup.reorder_level
        statuses = Prescription.objects.filter(clinic=clinic).values_list("status", flat=True)
        assert sorted(statuses) == ["DISPENSED", "DISPENSED", "PENDING"]


def test_dispensing_in_the_seed_used_the_soon_expiring_batch_first() -> None:
    run_seed()
    soon = MedicineBatch.objects.filter(batch_number="AMX-201")
    assert all(batch.quantity == 60 - 15 for batch in soon)


def test_running_seed_twice_changes_nothing() -> None:
    run_seed()
    counts = (
        Clinic.objects.count(),
        User.objects.count(),
        Appointment.objects.count(),
        Medicine.objects.count(),
        Prescription.objects.count(),
    )
    output = run_seed()
    assert "already complete" in output
    assert (
        Clinic.objects.count(),
        User.objects.count(),
        Appointment.objects.count(),
        Medicine.objects.count(),
        Prescription.objects.count(),
    ) == counts


def test_seed_adds_the_pharmacy_to_clinics_seeded_before_it_existed() -> None:
    """A database seeded before phase 6 has the clinics but no medicines yet."""
    for details in seed_demo.CLINICS:
        seed_demo.seed_clinic(details)  # only the first part, as the old command did

    output = run_seed()

    assert "medicines and prescriptions" in output
    assert Medicine.objects.count() == 2 * len(seed_demo.MEDICINES)
    assert Clinic.objects.count() == 2


def test_seed_lab_has_tests_and_an_order_in_each_state() -> None:
    run_seed()
    for clinic in Clinic.objects.all():
        assert LabTest.objects.filter(clinic=clinic).count() == len(seed_demo.LAB_TESTS)
        orders = LabOrder.objects.filter(clinic=clinic)
        assert sorted(orders.values_list("status", flat=True)) == [
            "COMPLETED",
            "ORDERED",
            "SAMPLE_COLLECTED",
        ]
        assert orders.filter(appointment__isnull=True).count() == 1  # the self-referred one
        completed = orders.get(status="COMPLETED")
        assert completed.invoice.status == "PAID"
        assert completed.items.count() == 2
