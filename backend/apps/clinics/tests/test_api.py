"""Tests for the clinic settings and department endpoints."""

from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, UserFactory
from apps.clinics.tests.factories import ClinicFactory, DepartmentFactory

CLINIC = "/api/v1/clinic/"
DEPARTMENTS = "/api/v1/departments/"

Role = User.Role
OTHER_ROLES = [Role.STAFF, Role.DOCTOR, Role.PHARMACIST, Role.LAB_TECHNICIAN]

pytestmark = pytest.mark.django_db


# ---------- clinic settings ----------


@pytest.mark.parametrize("role", list(Role.values[1:]))  # every role except SUPER_ADMIN
def test_every_role_can_read_clinic_settings(login_as, role) -> None:
    """Print pages for every role need the clinic's name, address and PAN."""
    response = login_as(UserFactory(role=role)).get(CLINIC)
    assert response.status_code == 200
    assert {"name", "pan_number", "receipt_width_mm", "vat_rate"} <= set(response.data)


def test_admin_can_change_vat_and_print_settings(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)

    response = login_as(admin).patch(
        CLINIC,
        {"vat_rate": "13.00", "vat_on_pharmacy": True, "receipt_width_mm": 58},
    )

    assert response.status_code == 200
    admin.clinic.refresh_from_db()
    assert admin.clinic.vat_on_pharmacy is True
    assert admin.clinic.receipt_width_mm == 58


@pytest.mark.parametrize("role", OTHER_ROLES)
def test_other_roles_cannot_change_clinic_settings(login_as, role) -> None:
    response = login_as(UserFactory(role=role)).patch(CLINIC, {"vat_on_lab": True})
    assert response.status_code == 403


@pytest.mark.parametrize("bad_rate", ["-1", "100.01"])
def test_vat_rate_must_be_between_0_and_100(login_as, bad_rate) -> None:
    client = login_as(UserFactory(role=Role.CLINIC_ADMIN))
    assert client.patch(CLINIC, {"vat_rate": bad_rate}).status_code == 400


def test_receipt_width_must_be_80_or_58(login_as) -> None:
    client = login_as(UserFactory(role=Role.CLINIC_ADMIN))
    assert client.patch(CLINIC, {"receipt_width_mm": 70}).status_code == 400


def test_admin_cannot_change_slug_or_invoice_counter(login_as) -> None:
    clinic = ClinicFactory(slug="original")
    client = login_as(UserFactory(clinic=clinic, role=Role.CLINIC_ADMIN))

    client.patch(CLINIC, {"slug": "changed", "last_invoice_number": 99})

    clinic.refresh_from_db()
    assert clinic.slug == "original"
    assert clinic.last_invoice_number == 0


def test_clinic_settings_cannot_be_replaced_or_deleted(login_as) -> None:
    client = login_as(UserFactory(role=Role.CLINIC_ADMIN))
    assert client.put(CLINIC, {}).status_code == 405
    assert client.delete(CLINIC).status_code == 405


def test_vat_rate_is_returned_as_an_exact_decimal_string(login_as) -> None:
    clinic = ClinicFactory(vat_rate=Decimal("13.00"))
    response = login_as(UserFactory(clinic=clinic)).get(CLINIC)
    assert response.data["vat_rate"] == "13.00"


# ---------- departments ----------


def test_admin_can_create_rename_and_delete_a_department(login_as) -> None:
    client = login_as(UserFactory(role=Role.CLINIC_ADMIN))

    created = client.post(DEPARTMENTS, {"name": "Cardiology"})
    assert created.status_code == 201
    url = f"{DEPARTMENTS}{created.data['id']}/"

    assert client.patch(url, {"name": "Heart"}).data["name"] == "Heart"
    assert client.delete(url).status_code == 204


@pytest.mark.parametrize("role", OTHER_ROLES)
def test_other_roles_can_list_but_not_change_departments(login_as, role) -> None:
    user = UserFactory(role=role)
    department = DepartmentFactory(clinic=user.clinic)
    client = login_as(user)

    assert client.get(DEPARTMENTS).status_code == 200
    assert client.post(DEPARTMENTS, {"name": "New"}).status_code == 403
    assert client.delete(f"{DEPARTMENTS}{department.id}/").status_code == 403


def test_duplicate_department_name_gives_a_clear_error(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    DepartmentFactory(clinic=admin.clinic, name="Cardiology")

    response = login_as(admin).post(DEPARTMENTS, {"name": "cardiology"})

    assert response.status_code == 400
    assert "name" in response.data


def test_renaming_a_department_to_its_own_name_is_allowed(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    department = DepartmentFactory(clinic=admin.clinic, name="Cardiology")
    response = login_as(admin).patch(f"{DEPARTMENTS}{department.id}/", {"name": "Cardiology"})
    assert response.status_code == 200


def test_deleting_a_department_keeps_its_doctors(login_as) -> None:
    """Doctor.department is SET_NULL: the doctor stays, just without a department."""
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    doctor = DoctorProfileFactory(clinic=admin.clinic)

    login_as(admin).delete(f"{DEPARTMENTS}{doctor.department.id}/")

    doctor.refresh_from_db()
    assert doctor.department is None


def test_department_list_is_paginated_by_20(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    DepartmentFactory.create_batch(21, clinic=admin.clinic)

    response = login_as(admin).get(DEPARTMENTS)

    assert response.data["count"] == 21
    assert len(response.data["results"]) == 20
    assert response.data["next"] is not None


def test_departments_can_be_searched_by_name(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    DepartmentFactory(clinic=admin.clinic, name="Cardiology")
    DepartmentFactory(clinic=admin.clinic, name="Dermatology")

    response = login_as(admin).get(DEPARTMENTS, {"search": "card"})

    assert [row["name"] for row in response.data["results"]] == ["Cardiology"]


def test_admin_sets_nepali_name_address_and_prescription_note(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    data = {
        "name_nepali": "नमुना क्लिनिक",
        "address_nepali": "नेपालगन्ज-१०",
        "prescription_note": "यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।",
    }

    response = login_as(admin).patch(CLINIC, data)

    assert response.status_code == 200
    for field, value in data.items():
        assert response.data[field] == value


def test_admin_sets_up_separate_lab_billing(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    data = {"lab_bills_separately": True, "lab_name": "Sample Path Lab", "lab_pan_number": "222"}
    response = login_as(admin).patch(CLINIC, data)
    assert response.status_code == 200
    admin.clinic.refresh_from_db()
    assert admin.clinic.lab_bills_separately is True
    assert admin.clinic.lab_name == "Sample Path Lab"


def test_lab_invoice_counter_cannot_be_set_through_the_api(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    login_as(admin).patch(CLINIC, {"last_lab_invoice_number": 50})
    admin.clinic.refresh_from_db()
    assert admin.clinic.last_lab_invoice_number == 0
