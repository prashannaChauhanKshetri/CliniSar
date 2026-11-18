"""Tests for the invoice endpoints and for invoices created by bookings."""

from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, PatientProfileFactory, UserFactory
from apps.billing import services
from apps.billing.models import Invoice
from apps.billing.services import Line
from apps.clinics.models import Clinic
from apps.clinics.tests.factories import ClinicFactory
from apps.lab.tests.factories import LabOrderFactory
from apps.records.tests.factories import PrescriptionFactory
from apps.scheduling.models import Appointment
from apps.scheduling.tests.factories import AppointmentFactory, DoctorScheduleFactory
from apps.scheduling.tests.helpers import next_date_for

INVOICES = "/api/v1/invoices/"
APPOINTMENTS = "/api/v1/appointments/"
Role = User.Role
Source = Invoice.Source
D = Decimal
pytestmark = pytest.mark.django_db


def invoice_for(source: str, clinic: Clinic, amount: str = "1000.00") -> Invoice:
    """An UNPAID invoice of the given source, made by the real service."""
    lines = [Line("Item", 1, D(amount))]
    if source == Source.CONSULTATION:
        appointment = AppointmentFactory(clinic=clinic)
        link, patient = {"appointment": appointment}, appointment.patient
    elif source == Source.PHARMACY:
        prescription = PrescriptionFactory(clinic=clinic)
        link, patient = {"prescription": prescription}, prescription.appointment.patient
    else:
        order = LabOrderFactory(clinic=clinic)
        link, patient = {"lab_order": order}, order.patient
    return services.create_invoice(
        clinic=clinic, patient=patient, source=source, lines=lines, **link
    )


@pytest.fixture
def clinic() -> Clinic:
    return ClinicFactory()


@pytest.fixture
def one_of_each(clinic) -> dict[str, Invoice]:
    return {source: invoice_for(source, clinic) for source in Source}


# ---------- reading ----------


def test_invoice_detail_includes_lines_and_print_details(login_as, clinic) -> None:
    invoice = invoice_for(Source.PHARMACY, clinic)
    response = login_as(UserFactory(clinic=clinic)).get(f"{INVOICES}{invoice.id}/")

    assert response.status_code == 200
    assert response.data["items"][0]["description"] == "Item"
    assert response.data["total"] == "1000.00"  # money is an exact decimal string
    assert response.data["issuer_name"] == clinic.name
    assert response.data["patient_name"] == invoice.patient.full_name


@pytest.mark.parametrize("role", [Role.CLINIC_ADMIN, Role.STAFF])
def test_admin_and_staff_see_every_invoice(login_as, clinic, one_of_each, role) -> None:
    rows = login_as(UserFactory(clinic=clinic, role=role)).get(INVOICES).data["results"]
    assert {row["source"] for row in rows} == {"CONSULTATION", "PHARMACY", "LAB"}


@pytest.mark.parametrize(
    ("role", "source"), [(Role.PHARMACIST, "PHARMACY"), (Role.LAB_TECHNICIAN, "LAB")]
)
def test_pharmacist_and_lab_technician_see_only_their_invoices(
    login_as, clinic, one_of_each, role, source
) -> None:
    client = login_as(UserFactory(clinic=clinic, role=role))

    rows = client.get(INVOICES).data["results"]
    assert [row["source"] for row in rows] == [source]

    consultation = one_of_each[Source.CONSULTATION]
    assert client.get(f"{INVOICES}{consultation.id}/").status_code == 404
    assert (
        client.post(f"{INVOICES}{consultation.id}/pay/", {"payment_method": "CASH"}).status_code
        == 404
    )


def test_doctor_cannot_see_invoices(login_as, clinic) -> None:
    doctor = DoctorProfileFactory(clinic=clinic)
    assert login_as(doctor.user).get(INVOICES).status_code == 403


def test_list_filters_by_status_and_source(login_as, clinic, one_of_each) -> None:
    services.cancel_invoice(one_of_each[Source.LAB], reason="x")
    client = login_as(UserFactory(clinic=clinic))
    rows = client.get(INVOICES, {"status": "UNPAID", "source": "PHARMACY"}).data["results"]
    assert [row["id"] for row in rows] == [str(one_of_each[Source.PHARMACY].id)]


# ---------- no hand-made invoices ----------


def test_invoices_cannot_be_created_edited_or_deleted_by_hand(login_as, clinic) -> None:
    invoice = invoice_for(Source.CONSULTATION, clinic)
    client = login_as(UserFactory(clinic=clinic, role=Role.CLINIC_ADMIN))
    url = f"{INVOICES}{invoice.id}/"

    assert client.post(INVOICES, {"total": "1.00"}).status_code == 405
    assert client.patch(url, {"total": "1.00"}).status_code == 405
    assert client.delete(url).status_code == 405


# ---------- paying ----------


@pytest.mark.parametrize(
    ("role", "source"),
    [
        (Role.STAFF, Source.CONSULTATION),
        (Role.CLINIC_ADMIN, Source.LAB),
        (Role.PHARMACIST, Source.PHARMACY),
        (Role.LAB_TECHNICIAN, Source.LAB),
    ],
)
def test_allowed_roles_take_payment(login_as, clinic, role, source) -> None:
    invoice = invoice_for(source, clinic)
    cashier = UserFactory(clinic=clinic, role=role)

    response = login_as(cashier).post(f"{INVOICES}{invoice.id}/pay/", {"payment_method": "WALLET"})

    assert response.status_code == 200
    assert response.data["status"] == "PAID"
    assert response.data["received_by_name"] == cashier.get_full_name()


def test_pay_with_discount_recalculates_on_the_server(login_as) -> None:
    clinic = ClinicFactory(vat_rate=D("13.00"), vat_on_consultation=True)
    invoice = invoice_for(Source.CONSULTATION, clinic)

    response = login_as(UserFactory(clinic=clinic)).post(
        f"{INVOICES}{invoice.id}/pay/",
        # The made-up total and VAT are ignored: only method and discount are read.
        {"payment_method": "CASH", "discount": "100.00", "total": "1.00", "vat_amount": "0"},
    )

    assert response.status_code == 200
    assert (response.data["vat_amount"], response.data["total"]) == ("117.00", "1017.00")


@pytest.mark.parametrize("discount", ["-5.00", "1000.01", "abc"])
def test_invalid_discount_is_refused_and_nothing_changes(login_as, clinic, discount) -> None:
    invoice = invoice_for(Source.CONSULTATION, clinic)
    response = login_as(UserFactory(clinic=clinic)).post(
        f"{INVOICES}{invoice.id}/pay/", {"payment_method": "CASH", "discount": discount}
    )
    assert response.status_code == 400
    invoice.refresh_from_db()
    assert (invoice.status, invoice.discount) == (Invoice.Status.UNPAID, D("0"))


def test_pay_needs_a_valid_method(login_as, clinic) -> None:
    invoice = invoice_for(Source.CONSULTATION, clinic)
    client = login_as(UserFactory(clinic=clinic))
    assert client.post(f"{INVOICES}{invoice.id}/pay/", {}).status_code == 400
    assert (
        client.post(f"{INVOICES}{invoice.id}/pay/", {"payment_method": "CHEQUE"}).status_code == 400
    )


def test_paid_invoice_cannot_be_paid_again_or_cancelled(login_as, clinic) -> None:
    invoice = invoice_for(Source.CONSULTATION, clinic)
    client = login_as(UserFactory(clinic=clinic))
    client.post(f"{INVOICES}{invoice.id}/pay/", {"payment_method": "CASH"})

    assert (
        client.post(f"{INVOICES}{invoice.id}/pay/", {"payment_method": "CARD"}).status_code == 400
    )
    assert client.post(f"{INVOICES}{invoice.id}/cancel/", {"reason": "x"}).status_code == 400


# ---------- cancelling ----------


def test_staff_cancels_an_unpaid_invoice_with_a_reason(login_as, clinic) -> None:
    invoice = invoice_for(Source.LAB, clinic)
    client = login_as(UserFactory(clinic=clinic, role=Role.STAFF))

    assert client.post(f"{INVOICES}{invoice.id}/cancel/", {}).status_code == 400
    response = client.post(f"{INVOICES}{invoice.id}/cancel/", {"reason": "Duplicate"})

    assert response.status_code == 200
    assert response.data["status"] == "CANCELLED"


@pytest.mark.parametrize(
    ("role", "source"), [(Role.PHARMACIST, Source.PHARMACY), (Role.LAB_TECHNICIAN, Source.LAB)]
)
def test_pharmacist_and_lab_technician_cannot_cancel(login_as, clinic, role, source) -> None:
    invoice = invoice_for(source, clinic)
    response = login_as(UserFactory(clinic=clinic, role=role)).post(
        f"{INVOICES}{invoice.id}/cancel/", {"reason": "x"}
    )
    assert response.status_code == 403


# ---------- invoices created by visits ----------


@pytest.fixture
def schedule(clinic):
    doctor = DoctorProfileFactory(clinic=clinic, consultation_fee=D("700.00"))
    return DoctorScheduleFactory(
        clinic=clinic, doctor=doctor, weekday=0, start_time="10:00", end_time="11:00"
    )


def book(client, schedule, **changes):
    patient = PatientProfileFactory(clinic=schedule.clinic)
    data = {
        "patient": str(patient.id),
        "doctor": str(schedule.doctor.id),
        "date": next_date_for(0).isoformat(),
        "start_time": "10:00",
        **changes,
    }
    return client.post(APPOINTMENTS, data)


def test_booking_creates_a_consultation_invoice_at_the_doctors_fee(login_as, schedule) -> None:
    response = book(login_as(UserFactory(clinic=schedule.clinic)), schedule)

    invoice = Invoice.objects.get(appointment_id=response.data["id"])
    assert invoice.source == Source.CONSULTATION
    assert invoice.total == D("700.00")
    assert invoice.number == 1
    item = invoice.items.get()
    assert item.description == f"Consultation - Dr. {schedule.doctor.user.get_full_name()}"
    assert (item.quantity, item.unit_price) == (1, D("700.00"))


def test_walk_in_also_creates_a_consultation_invoice(login_as, schedule) -> None:
    patient = PatientProfileFactory(clinic=schedule.clinic)
    response = login_as(UserFactory(clinic=schedule.clinic)).post(
        APPOINTMENTS,
        {"visit_type": "WALK_IN", "patient": str(patient.id), "doctor": str(schedule.doctor.id)},
    )
    assert Invoice.objects.get(appointment_id=response.data["id"]).total == D("700.00")


def test_failed_booking_creates_no_invoice(login_as, schedule) -> None:
    client = login_as(UserFactory(clinic=schedule.clinic))
    book(client, schedule)
    assert book(client, schedule).status_code == 409
    assert Invoice.objects.count() == 1


def test_later_fee_change_does_not_change_the_invoice(login_as, schedule) -> None:
    response = book(login_as(UserFactory(clinic=schedule.clinic)), schedule)
    schedule.doctor.consultation_fee = D("1500.00")
    schedule.doctor.save()
    assert Invoice.objects.get(appointment_id=response.data["id"]).total == D("700.00")


def test_cancelling_a_visit_cancels_its_unpaid_invoice(login_as, schedule) -> None:
    client = login_as(UserFactory(clinic=schedule.clinic))
    appointment_id = book(client, schedule).data["id"]

    client.post(f"{APPOINTMENTS}{appointment_id}/cancel/", {"reason": "Patient called"})

    invoice = Invoice.objects.get(appointment_id=appointment_id)
    assert invoice.status == Invoice.Status.CANCELLED
    assert invoice.cancel_reason == "Appointment cancelled: Patient called"


def test_cancelling_a_visit_leaves_a_paid_invoice_paid(login_as, schedule) -> None:
    """No refunds: the money was taken, so the bill stays as it is."""
    client = login_as(UserFactory(clinic=schedule.clinic))
    appointment_id = book(client, schedule).data["id"]
    invoice = Invoice.objects.get(appointment_id=appointment_id)
    client.post(f"{INVOICES}{invoice.id}/pay/", {"payment_method": "CASH"})

    response = client.post(f"{APPOINTMENTS}{appointment_id}/cancel/", {"reason": "Left early"})

    assert response.status_code == 200
    assert Appointment.objects.get(id=appointment_id).status == Appointment.Status.CANCELLED
    invoice.refresh_from_db()
    assert invoice.status == Invoice.Status.PAID


def test_booking_numbers_follow_each_other(login_as, schedule) -> None:
    client = login_as(UserFactory(clinic=schedule.clinic))
    book(client, schedule, start_time="10:00")
    book(client, schedule, start_time="10:20")
    assert sorted(Invoice.objects.values_list("number", flat=True)) == [1, 2]


def test_bill_of_one_event_can_be_found(login_as, clinic, one_of_each) -> None:
    lab_bill = one_of_each[Source.LAB]
    rows = (
        login_as(UserFactory(clinic=clinic))
        .get(INVOICES, {"lab_order": str(lab_bill.lab_order_id)})
        .data["results"]
    )
    assert [row["id"] for row in rows] == [str(lab_bill.id)]
