"""Tests for the staff, doctor and patient endpoints."""

from decimal import Decimal

import pytest

from apps.accounts.models import DoctorProfile, PatientProfile, User
from apps.accounts.tests.factories import (
    DoctorProfileFactory,
    PatientProfileFactory,
    UserFactory,
)
from apps.clinics.tests.factories import DepartmentFactory
from apps.scheduling.tests.factories import AppointmentFactory

STAFF = "/api/v1/staff/"
DOCTORS = "/api/v1/doctors/"
PATIENTS = "/api/v1/patients/"

Role = User.Role
GOOD_PASSWORD = "a-good-pass-123"

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin() -> User:
    return UserFactory(role=Role.CLINIC_ADMIN)


# ---------- staff ----------


@pytest.mark.parametrize("role", ["STAFF", "PHARMACIST", "LAB_TECHNICIAN"])
def test_admin_can_create_each_staff_role(login_as, admin, role) -> None:
    response = login_as(admin).post(
        STAFF,
        {
            "email": f"New.{role}@Example.com",
            "first_name": "Sita",
            "last_name": "Rai",
            "role": role,
            "password": GOOD_PASSWORD,
        },
    )

    assert response.status_code == 201
    assert "password" not in response.data
    user = User.objects.get(id=response.data["id"])
    assert user.clinic == admin.clinic
    assert user.email == f"new.{role.lower()}@example.com"
    assert user.check_password(GOOD_PASSWORD)  # stored hashed and usable for login


@pytest.mark.parametrize("role", ["CLINIC_ADMIN", "DOCTOR", "SUPER_ADMIN"])
def test_staff_endpoint_refuses_other_roles(login_as, admin, role) -> None:
    """Doctors are made at doctors/; admins only by the super admin."""
    response = login_as(admin).post(
        STAFF,
        {
            "email": "x@example.com",
            "first_name": "A",
            "last_name": "B",
            "role": role,
            "password": GOOD_PASSWORD,
        },
    )
    assert response.status_code == 400
    assert "role" in response.data


def test_new_staff_member_needs_a_strong_password(login_as, admin) -> None:
    data = {"email": "x@example.com", "first_name": "A", "last_name": "B", "role": "STAFF"}
    client = login_as(admin)
    assert "password" in client.post(STAFF, data).data
    assert "password" in client.post(STAFF, {**data, "password": "12345678"}).data


def test_staff_email_must_be_unique(login_as, admin) -> None:
    UserFactory(email="taken@example.com")  # even in another clinic
    response = login_as(admin).post(
        STAFF,
        {
            "email": "Taken@example.com",
            "first_name": "A",
            "last_name": "B",
            "role": "STAFF",
            "password": GOOD_PASSWORD,
        },
    )
    assert response.status_code == 400
    assert "email" in response.data


def test_staff_list_hides_admins_and_doctors(login_as, admin) -> None:
    staff = UserFactory(clinic=admin.clinic, role=Role.PHARMACIST)
    DoctorProfileFactory(clinic=admin.clinic)

    response = login_as(admin).get(STAFF)

    assert [row["id"] for row in response.data["results"]] == [str(staff.id)]


def test_staff_list_can_be_filtered_by_role(login_as, admin) -> None:
    UserFactory(clinic=admin.clinic, role=Role.PHARMACIST)
    UserFactory(clinic=admin.clinic, role=Role.STAFF)

    response = login_as(admin).get(STAFF, {"role": "PHARMACIST"})

    assert [row["role"] for row in response.data["results"]] == ["PHARMACIST"]


def test_deleting_staff_deactivates_instead(login_as, admin) -> None:
    staff = UserFactory(clinic=admin.clinic)

    assert login_as(admin).delete(f"{STAFF}{staff.id}/").status_code == 204

    staff.refresh_from_db()  # the row still exists
    assert staff.is_active is False


def test_admin_can_reactivate_staff_and_reset_password(login_as, admin) -> None:
    staff = UserFactory(clinic=admin.clinic, is_active=False)

    response = login_as(admin).patch(
        f"{STAFF}{staff.id}/", {"is_active": True, "password": GOOD_PASSWORD}
    )

    assert response.status_code == 200
    staff.refresh_from_db()
    assert staff.is_active
    assert staff.check_password(GOOD_PASSWORD)


@pytest.mark.parametrize("role", ["STAFF", "DOCTOR", "PHARMACIST", "LAB_TECHNICIAN"])
def test_only_admin_can_use_the_staff_endpoint(login_as, role) -> None:
    assert login_as(UserFactory(role=role)).get(STAFF).status_code == 403


# ---------- doctors ----------


def new_doctor_data(**changes) -> dict:
    data = {
        "email": "dr.hari@example.com",
        "first_name": "Hari",
        "last_name": "Rai",
        "password": GOOD_PASSWORD,
        "specialization": "Cardiologist",
        "consultation_fee": "800.00",
    }
    return {**data, **changes}


def test_admin_creates_doctor_login_and_profile_together(login_as, admin) -> None:
    department = DepartmentFactory(clinic=admin.clinic, name="Cardiology")

    response = login_as(admin).post(DOCTORS, new_doctor_data(department=str(department.id)))

    assert response.status_code == 201
    assert response.data["department_name"] == "Cardiology"
    doctor = DoctorProfile.objects.get(id=response.data["id"])
    assert doctor.user.role == Role.DOCTOR
    assert doctor.user.clinic == admin.clinic
    assert doctor.user.check_password(GOOD_PASSWORD)
    assert doctor.consultation_fee == Decimal("800.00")


def test_failed_doctor_creation_leaves_no_half_made_user(login_as, admin) -> None:
    response = login_as(admin).post(DOCTORS, new_doctor_data(consultation_fee="-5"))
    assert response.status_code == 400
    assert not User.objects.filter(email="dr.hari@example.com").exists()


def test_doctor_email_must_be_unique(login_as, admin) -> None:
    UserFactory(email="dr.hari@example.com")
    response = login_as(admin).post(DOCTORS, new_doctor_data())
    assert response.status_code == 400
    assert "email" in response.data


def test_admin_can_edit_doctor_details_in_one_request(login_as, admin) -> None:
    doctor = DoctorProfileFactory(clinic=admin.clinic)

    response = login_as(admin).patch(
        f"{DOCTORS}{doctor.id}/", {"first_name": "Shyam", "consultation_fee": "1000.00"}
    )

    assert response.status_code == 200
    doctor.refresh_from_db()
    assert doctor.user.first_name == "Shyam"
    assert doctor.consultation_fee == Decimal("1000.00")


def test_doctor_keeps_own_email_when_saved_again(login_as, admin) -> None:
    doctor = DoctorProfileFactory(clinic=admin.clinic)
    response = login_as(admin).patch(f"{DOCTORS}{doctor.id}/", {"email": doctor.user.email})
    assert response.status_code == 200


def test_deleting_a_doctor_deactivates_the_login(login_as, admin) -> None:
    doctor = DoctorProfileFactory(clinic=admin.clinic)

    assert login_as(admin).delete(f"{DOCTORS}{doctor.id}/").status_code == 204

    doctor.user.refresh_from_db()
    assert doctor.user.is_active is False
    assert DoctorProfile.objects.filter(id=doctor.id).exists()


@pytest.mark.parametrize("role", ["STAFF", "DOCTOR", "PHARMACIST", "LAB_TECHNICIAN"])
def test_every_role_can_list_doctors_but_only_admin_changes_them(login_as, role) -> None:
    """Staff need the doctor list to book appointments."""
    user = UserFactory(role=role)
    doctor = DoctorProfileFactory(clinic=user.clinic)
    client = login_as(user)

    assert client.get(DOCTORS).status_code == 200
    assert client.post(DOCTORS, new_doctor_data()).status_code == 403
    assert client.patch(f"{DOCTORS}{doctor.id}/", {"bio": "x"}).status_code == 403


def test_doctor_list_never_shows_the_password(login_as, admin) -> None:
    DoctorProfileFactory(clinic=admin.clinic)
    row = login_as(admin).get(DOCTORS).data["results"][0]
    assert "password" not in row


def test_doctor_list_uses_a_fixed_number_of_queries(
    login_as, admin, django_assert_max_num_queries
) -> None:
    """select_related loads user and department together, not one query per doctor."""
    DoctorProfileFactory.create_batch(5, clinic=admin.clinic)
    client = login_as(admin)
    with django_assert_max_num_queries(3):  # count + page (+ savepoint overhead)
        client.get(DOCTORS)


# ---------- patients ----------


def new_patient_data(**changes) -> dict:
    data = {"first_name": "Ram", "last_name": "Thapa", "phone": "9800000001"}
    return {**data, **changes}


@pytest.mark.parametrize("role", ["CLINIC_ADMIN", "STAFF"])
def test_admin_and_staff_manage_patients(login_as, role) -> None:
    client = login_as(UserFactory(role=role))

    created = client.post(PATIENTS, new_patient_data(blood_group="O+"))
    assert created.status_code == 201
    assert created.data["full_name"] == "Ram Thapa"
    url = f"{PATIENTS}{created.data['id']}/"

    assert client.patch(url, {"phone": "9811111111"}).status_code == 200
    assert client.delete(url).status_code == 204


def test_pharmacist_cannot_use_patients(login_as) -> None:
    client = login_as(UserFactory(role=Role.PHARMACIST))
    assert client.get(PATIENTS).status_code == 403
    assert client.post(PATIENTS, new_patient_data()).status_code == 403


def test_lab_technician_searches_and_registers_but_cannot_edit(login_as) -> None:
    """For people who come straight to the lab."""
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    existing = PatientProfileFactory(clinic=lab_tech.clinic, first_name="Ram")
    client = login_as(lab_tech)

    assert client.get(PATIENTS, {"search": "ram"}).data["count"] == 1
    created = client.post(PATIENTS, new_patient_data(first_name="Walk", last_name="In"))
    assert created.status_code == 201
    assert client.patch(f"{PATIENTS}{existing.id}/", {"phone": "1"}).status_code == 403
    assert client.delete(f"{PATIENTS}{existing.id}/").status_code == 403


def test_lab_registrations_need_checking_and_record_who(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN, first_name="Lab", last_name="Tech")
    staff = UserFactory(clinic=lab_tech.clinic, role=Role.STAFF)

    from_lab = login_as(lab_tech).post(PATIENTS, new_patient_data()).data
    from_desk = login_as(staff).post(PATIENTS, new_patient_data(first_name="Desk")).data

    assert (from_lab["needs_review"], from_lab["registered_by_name"]) == (True, "Lab Tech")
    assert from_desk["needs_review"] is False


def test_needs_review_cannot_be_set_by_the_client(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    created = login_as(lab_tech).post(PATIENTS, new_patient_data(needs_review=False)).data
    assert created["needs_review"] is True


def test_front_desk_lists_and_clears_patients_to_check(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    flagged = PatientProfileFactory(clinic=staff.clinic, needs_review=True)
    PatientProfileFactory(clinic=staff.clinic)
    client = login_as(staff)

    rows = client.get(PATIENTS, {"needs_review": "true"}).data["results"]
    assert [row["id"] for row in rows] == [str(flagged.id)]

    response = client.post(f"{PATIENTS}{flagged.id}/mark-checked/")
    assert (response.status_code, response.data["needs_review"]) == (200, False)


@pytest.mark.parametrize("role", [Role.LAB_TECHNICIAN, Role.DOCTOR])
def test_only_front_desk_and_admin_clear_the_flag(login_as, role) -> None:
    user = UserFactory(role=role)
    flagged = PatientProfileFactory(clinic=user.clinic, needs_review=True)
    assert login_as(user).post(f"{PATIENTS}{flagged.id}/mark-checked/").status_code == 403


def test_doctor_sees_only_own_patients_and_cannot_change_them(login_as) -> None:
    doctor = DoctorProfileFactory()
    clinic = doctor.user.clinic
    own = AppointmentFactory(clinic=clinic, doctor=doctor).patient
    AppointmentFactory(clinic=clinic, doctor=doctor, patient=own)  # second visit
    stranger = PatientProfileFactory(clinic=clinic)
    client = login_as(doctor.user)

    response = client.get(PATIENTS)

    assert [row["id"] for row in response.data["results"]] == [str(own.id)]  # no duplicate
    assert client.get(f"{PATIENTS}{stranger.id}/").status_code == 404
    assert client.patch(f"{PATIENTS}{own.id}/", {"phone": "1"}).status_code == 403
    assert client.post(PATIENTS, new_patient_data()).status_code == 403


def test_patient_with_appointments_cannot_be_deleted(login_as) -> None:
    """PROTECT keeps the medical history; the API answers 409, not a server error."""
    staff = UserFactory(role=Role.STAFF)
    patient = AppointmentFactory(clinic=staff.clinic).patient

    response = login_as(staff).delete(f"{PATIENTS}{patient.id}/")

    assert response.status_code == 409


def test_patient_fields_are_validated(login_as) -> None:
    client = login_as(UserFactory(role=Role.STAFF))
    response = client.post(PATIENTS, new_patient_data(blood_group="Z+", first_name=""))
    assert response.status_code == 400
    assert {"blood_group", "first_name"} <= set(response.data)


def test_patients_can_be_searched_by_name_or_phone(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    PatientProfileFactory(clinic=staff.clinic, first_name="Ram", phone="9801111111")
    PatientProfileFactory(clinic=staff.clinic, first_name="Sita", phone="9802222222")
    client = login_as(staff)

    by_name = client.get(PATIENTS, {"search": "sit"}).data["results"]
    by_phone = client.get(PATIENTS, {"search": "98011"}).data["results"]

    assert [row["first_name"] for row in by_name] == ["Sita"]
    assert [row["first_name"] for row in by_phone] == ["Ram"]


def test_doctor_letterhead_fields_are_saved(login_as, admin) -> None:
    """Printed at the top of the doctor's prescriptions, as on the real pads."""
    letterhead = {
        "name_nepali": "डा. हरि राई",
        "qualifications": "M.B.B.S., M.S.",
        "designation": "Consultant ENT Surgeon",
        "license_number": "1234",
    }
    response = login_as(admin).post(DOCTORS, new_doctor_data(**letterhead))

    assert response.status_code == 201
    for field, value in letterhead.items():
        assert response.data[field] == value


# ---------- one person, one record ----------


def test_same_name_and_phone_is_refused_with_the_existing_patient(login_as) -> None:
    staff = UserFactory(role=Role.STAFF)
    client = login_as(staff)
    existing = client.post(PATIENTS, new_patient_data()).data

    # Different capitals and extra spaces are still the same person.
    again = client.post(
        PATIENTS, new_patient_data(first_name=" ram ", last_name="THAPA", phone="98000 00001")
    )

    assert again.status_code == 409
    assert again.data["existing_patient_id"] == existing["id"]
    assert again.data["existing_patient_name"] == "Ram Thapa"
    assert PatientProfile.objects.filter(clinic=staff.clinic).count() == 1


def test_lab_registration_of_a_known_patient_is_refused_too(login_as) -> None:
    lab_tech = UserFactory(role=Role.LAB_TECHNICIAN)
    PatientProfileFactory(
        clinic=lab_tech.clinic, first_name="Ram", last_name="Thapa", phone="9800000001"
    )
    assert login_as(lab_tech).post(PATIENTS, new_patient_data()).status_code == 409


@pytest.mark.parametrize(
    "changes",
    [
        {"phone": ""},  # no phone: cannot tell, the screen warns instead
        {"phone": "9811111111"},  # same name, other phone: another person
        {"first_name": "Hari"},  # same phone, other name: a family member
    ],
)
def test_these_are_different_patients(login_as, changes) -> None:
    client = login_as(UserFactory(role=Role.STAFF))
    assert client.post(PATIENTS, new_patient_data(**changes)).status_code == 201
    assert client.post(PATIENTS, new_patient_data()).status_code == 201


def test_two_same_name_patients_without_phone_are_allowed(login_as) -> None:
    client = login_as(UserFactory(role=Role.STAFF))
    assert client.post(PATIENTS, new_patient_data(phone="")).status_code == 201
    assert client.post(PATIENTS, new_patient_data(phone="")).status_code == 201


def test_editing_into_a_duplicate_is_refused_but_saving_yourself_is_fine(login_as) -> None:
    client = login_as(UserFactory(role=Role.STAFF))
    ram = client.post(PATIENTS, new_patient_data()).data
    hari = client.post(PATIENTS, new_patient_data(first_name="Hari")).data

    assert client.patch(f"{PATIENTS}{ram['id']}/", {"address": "Bardiya"}).status_code == 200
    assert client.patch(f"{PATIENTS}{hari['id']}/", {"first_name": "Ram"}).status_code == 409


def test_another_clinic_may_have_the_same_patient(login_as) -> None:
    PatientProfileFactory(first_name="Ram", last_name="Thapa", phone="9800000001")
    assert (
        login_as(UserFactory(role=Role.STAFF)).post(PATIENTS, new_patient_data()).status_code == 201
    )


def test_database_refuses_a_duplicate_saved_past_the_check() -> None:
    """The backstop for two desks saving the same person at the same moment."""
    from django.db import IntegrityError

    first = PatientProfileFactory(first_name="Ram", last_name="Thapa", phone="9800000001")
    with pytest.raises(IntegrityError):
        PatientProfileFactory(
            clinic=first.clinic, first_name="RAM", last_name="thapa", phone="9800000001"
        )


def test_patients_with_the_same_name_can_be_listed(login_as) -> None:
    """The form asks "is this one of them?" before registering a same-name patient."""
    staff = UserFactory(role=Role.STAFF)
    PatientProfileFactory(clinic=staff.clinic, first_name="Ram", last_name="Thapa", phone="")
    PatientProfileFactory(clinic=staff.clinic, first_name="Ram", last_name="Karki")
    response = login_as(staff).get(
        PATIENTS, {"first_name__iexact": "ram", "last_name__iexact": "THAPA"}
    )
    assert response.data["count"] == 1
