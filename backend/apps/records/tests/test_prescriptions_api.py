"""Tests for prescriptions/: who may create, view and dispense."""

import datetime
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, UserFactory
from apps.billing.models import Invoice
from apps.pharmacy import services as pharmacy
from apps.pharmacy.tests.factories import MedicineFactory
from apps.records.models import Prescription
from apps.records.tests.factories import PrescriptionFactory, PrescriptionItemFactory
from apps.scheduling.models import Appointment
from apps.scheduling.tests.factories import AppointmentFactory

PRESCRIPTIONS = "/api/v1/prescriptions/"
Role = User.Role
pytestmark = pytest.mark.django_db


@pytest.fixture
def appointment():
    return AppointmentFactory()


@pytest.fixture
def doctor_user(appointment) -> User:
    return appointment.doctor.user


def item(medicine, **changes) -> dict:
    data = {
        "medicine": str(medicine.id),
        "dosage": "500mg",
        "frequency": "1-0-1",
        "duration_days": 5,
        "quantity": 10,
        "instructions": "After food",
    }
    return {**data, **changes}


def new_prescription(appointment, *items) -> dict:
    return {"appointment": str(appointment.id), "diagnosis": "Viral fever", "items": list(items)}


# ---------- creating ----------


def test_doctor_writes_a_prescription_for_own_appointment(login_as, appointment, doctor_user):
    medicine = MedicineFactory(clinic=appointment.clinic, name="Paracetamol", strength="500mg")

    response = login_as(doctor_user).post(
        PRESCRIPTIONS, new_prescription(appointment, item(medicine)), format="json"
    )

    assert response.status_code == 201
    assert response.data["status"] == "PENDING"
    assert response.data["patient_name"] == appointment.patient.full_name
    assert response.data["items"][0]["medicine_name"] == "Paracetamol 500mg"
    assert Prescription.objects.get(id=response.data["id"]).clinic == appointment.clinic


def test_doctor_cannot_prescribe_for_a_colleagues_appointment(login_as, appointment) -> None:
    colleague = DoctorProfileFactory(clinic=appointment.clinic)
    medicine = MedicineFactory(clinic=appointment.clinic)
    response = login_as(colleague.user).post(
        PRESCRIPTIONS, new_prescription(appointment, item(medicine)), format="json"
    )
    assert response.status_code == 400
    assert "appointment" in response.data


@pytest.mark.parametrize("status", ["CANCELLED", "NO_SHOW"])
def test_no_prescription_for_a_visit_that_did_not_happen(login_as, status) -> None:
    appointment = AppointmentFactory(status=status)
    medicine = MedicineFactory(clinic=appointment.clinic)
    response = login_as(appointment.doctor.user).post(
        PRESCRIPTIONS, new_prescription(appointment, item(medicine)), format="json"
    )
    assert response.status_code == 400


def test_completed_visit_can_get_its_prescription(login_as) -> None:
    appointment = AppointmentFactory(status=Appointment.Status.COMPLETED)
    medicine = MedicineFactory(clinic=appointment.clinic)
    response = login_as(appointment.doctor.user).post(
        PRESCRIPTIONS, new_prescription(appointment, item(medicine)), format="json"
    )
    assert response.status_code == 201


def test_only_one_prescription_per_appointment(login_as, appointment, doctor_user) -> None:
    medicine = MedicineFactory(clinic=appointment.clinic)
    client = login_as(doctor_user)
    data = new_prescription(appointment, item(medicine))
    assert client.post(PRESCRIPTIONS, data, format="json").status_code == 201
    second = client.post(PRESCRIPTIONS, data, format="json")
    assert second.status_code == 400
    assert "already has a prescription" in str(second.data)


@pytest.mark.parametrize("problem", ["no_items", "same_medicine_twice", "zero_quantity"])
def test_invalid_items_are_refused(login_as, appointment, doctor_user, problem) -> None:
    medicine = MedicineFactory(clinic=appointment.clinic)
    items = {
        "no_items": [],
        "same_medicine_twice": [item(medicine), item(medicine)],
        "zero_quantity": [item(medicine, quantity=0)],
    }[problem]
    response = login_as(doctor_user).post(
        PRESCRIPTIONS, new_prescription(appointment, *items), format="json"
    )
    assert response.status_code == 400
    assert not Prescription.objects.exists()


def test_medicine_and_appointment_must_be_from_the_same_clinic(login_as, doctor_user) -> None:
    their_medicine = MedicineFactory()  # another clinic
    their_appointment = AppointmentFactory()  # another clinic
    response = login_as(doctor_user).post(
        PRESCRIPTIONS, new_prescription(their_appointment, item(their_medicine)), format="json"
    )
    assert response.status_code == 400
    assert {"appointment", "items"} <= set(response.data)


@pytest.mark.parametrize("role", [Role.STAFF, Role.CLINIC_ADMIN, Role.PHARMACIST])
def test_only_doctors_write_prescriptions(login_as, appointment, role) -> None:
    medicine = MedicineFactory(clinic=appointment.clinic)
    user = UserFactory(clinic=appointment.clinic, role=role)
    response = login_as(user).post(
        PRESCRIPTIONS, new_prescription(appointment, item(medicine)), format="json"
    )
    assert response.status_code == 403


def test_prescriptions_cannot_be_edited_or_deleted(login_as, appointment, doctor_user) -> None:
    prescription = PrescriptionFactory(clinic=appointment.clinic, appointment=appointment)
    client = login_as(doctor_user)
    assert client.patch(f"{PRESCRIPTIONS}{prescription.id}/", {"diagnosis": "x"}).status_code == 405
    assert client.delete(f"{PRESCRIPTIONS}{prescription.id}/").status_code == 405


# ---------- viewing ----------


@pytest.mark.parametrize("role", [Role.STAFF, Role.CLINIC_ADMIN, Role.PHARMACIST])
def test_staff_admin_and_pharmacist_view_every_prescription(login_as, role) -> None:
    prescription = PrescriptionFactory()
    user = UserFactory(clinic=prescription.clinic, role=role)
    assert login_as(user).get(f"{PRESCRIPTIONS}{prescription.id}/").status_code == 200


def test_lab_technician_cannot_view_prescriptions(login_as) -> None:
    assert login_as(UserFactory(role=Role.LAB_TECHNICIAN)).get(PRESCRIPTIONS).status_code == 403


def test_doctor_sees_prescriptions_of_own_patients_only(login_as) -> None:
    mine = PrescriptionFactory()
    clinic, doctor = mine.clinic, mine.appointment.doctor
    patient = mine.appointment.patient
    # A colleague's earlier prescription for the same patient is part of their history.
    colleague_visit = AppointmentFactory(clinic=clinic, patient=patient)
    history = PrescriptionFactory(clinic=clinic, appointment=colleague_visit)
    stranger = PrescriptionFactory(clinic=clinic)  # another patient of a colleague

    ids = {row["id"] for row in login_as(doctor.user).get(PRESCRIPTIONS).data["results"]}

    assert ids == {str(mine.id), str(history.id)}
    assert str(stranger.id) not in ids


# ---------- dispensing through the API ----------


def stocked_prescription(quantity_in_stock: int):
    prescription = PrescriptionFactory()
    medicine = MedicineFactory(
        clinic=prescription.clinic, name="Cetirizine", unit_price=Decimal("3.00")
    )
    PrescriptionItemFactory(prescription=prescription, medicine=medicine, quantity=10)
    pharmacist = UserFactory(clinic=prescription.clinic, role=Role.PHARMACIST)
    pharmacy.record_purchase(
        medicine,
        batch_number="B-1",
        expiry_date=timezone.localdate() + datetime.timedelta(days=100),
        quantity=quantity_in_stock,
        user=pharmacist,
    )
    return prescription, pharmacist


def test_pharmacist_dispenses_and_a_pharmacy_bill_appears(login_as) -> None:
    prescription, pharmacist = stocked_prescription(50)

    response = login_as(pharmacist).post(f"{PRESCRIPTIONS}{prescription.id}/dispense/")

    assert response.status_code == 200
    assert response.data["status"] == "DISPENSED"
    assert response.data["dispensed_by_name"] == pharmacist.get_full_name()
    assert Invoice.objects.get(prescription=prescription).total == Decimal("30.00")


def test_short_stock_gives_409_with_the_medicine_name(login_as) -> None:
    prescription, pharmacist = stocked_prescription(4)
    response = login_as(pharmacist).post(f"{PRESCRIPTIONS}{prescription.id}/dispense/")
    assert response.status_code == 409
    assert "Cetirizine" in response.data["detail"]


def test_dispensing_twice_gives_400(login_as) -> None:
    prescription, pharmacist = stocked_prescription(50)
    client = login_as(pharmacist)
    client.post(f"{PRESCRIPTIONS}{prescription.id}/dispense/")
    assert client.post(f"{PRESCRIPTIONS}{prescription.id}/dispense/").status_code == 400


@pytest.mark.parametrize("role", [Role.PHARMACIST, Role.STAFF])
def test_pharmacist_and_front_desk_dispense(login_as, role) -> None:
    prescription, _ = stocked_prescription(50)
    user = UserFactory(clinic=prescription.clinic, role=role)
    response = login_as(user).post(f"{PRESCRIPTIONS}{prescription.id}/dispense/")
    assert response.status_code == 200
    assert response.data["dispensed_by_name"] == user.get_full_name()


@pytest.mark.parametrize("role", [Role.CLINIC_ADMIN, Role.DOCTOR, Role.LAB_TECHNICIAN])
def test_other_roles_cannot_dispense(login_as, role) -> None:
    prescription, _ = stocked_prescription(50)
    user = UserFactory(clinic=prescription.clinic, role=role)
    assert login_as(user).post(f"{PRESCRIPTIONS}{prescription.id}/dispense/").status_code == 403
