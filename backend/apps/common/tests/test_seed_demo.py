"""Tests for the seed_demo management command."""

from io import StringIO

import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.billing.models import Invoice
from apps.clinics.models import Clinic
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


def test_running_seed_twice_changes_nothing() -> None:
    run_seed()
    counts = (Clinic.objects.count(), User.objects.count(), Appointment.objects.count())
    output = run_seed()
    assert "already exist" in output
    assert (Clinic.objects.count(), User.objects.count(), Appointment.objects.count()) == counts
