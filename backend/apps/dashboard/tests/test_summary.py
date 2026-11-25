"""Tests for GET dashboard/summary/: ranges, comparisons, money, charts and role scoping."""

import datetime
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, PatientProfileFactory, UserFactory
from apps.billing.models import Invoice
from apps.billing.tests.factories import InvoiceFactory
from apps.clinics.tests.factories import ClinicFactory, DepartmentFactory
from apps.dashboard import services
from apps.lab.tests.factories import LabOrderFactory
from apps.pharmacy.models import MedicineBatch
from apps.pharmacy.tests.factories import MedicineBatchFactory, MedicineFactory
from apps.scheduling.tests.factories import AppointmentFactory

SUMMARY = "/api/v1/dashboard/summary/"
Role = User.Role
TODAY = datetime.date(2026, 11, 18)


def days_ago(days: int) -> datetime.date:
    return timezone.localdate() - datetime.timedelta(days=days)


def at_noon(day: datetime.date) -> datetime.datetime:
    """A timestamp at noon Nepal time on that day."""
    return timezone.make_aware(datetime.datetime.combine(day, datetime.time(12, 0)))


# ---------- ranges and percentages (no database) ----------


def test_week_is_the_last_7_days_compared_with_the_7_before() -> None:
    current, previous = services.periods("week", TODAY)
    assert (current.first, current.last) == (datetime.date(2026, 11, 12), TODAY)
    assert (previous.first, previous.last) == (
        datetime.date(2026, 11, 5),
        datetime.date(2026, 11, 11),
    )


def test_month_is_the_last_30_days_compared_with_the_30_before() -> None:
    current, previous = services.periods("month", TODAY)
    assert current.first == datetime.date(2026, 10, 20)
    assert (previous.first, previous.last) == (
        datetime.date(2026, 9, 20),
        datetime.date(2026, 10, 19),
    )


@pytest.mark.parametrize(
    ("current", "previous", "expected"),
    [(15, 10, 50.0), (5, 10, -50.0), (10, 10, 0.0), (1, 3, -66.7), (5, 0, None), (0, 0, None)],
)
def test_change_percent(current, previous, expected) -> None:
    assert services.change_percent(current, previous) == expected


# ---------- numbers ----------


@pytest.fixture
def admin():
    return UserFactory(role=Role.CLINIC_ADMIN)


def get_summary(login_as, user, range_name="week") -> dict:
    response = login_as(user).get(SUMMARY, {"range": range_name})
    assert response.status_code == 200
    return response.data


@pytest.mark.django_db
def test_appointments_this_week_against_last_week(login_as, admin) -> None:
    for days in (0, 3, 6):  # this week
        AppointmentFactory(clinic=admin.clinic, date=days_ago(days))
    for days in (7, 13):  # previous week
        AppointmentFactory(clinic=admin.clinic, date=days_ago(days))
    AppointmentFactory(clinic=admin.clinic, date=days_ago(20))  # outside both

    data = get_summary(login_as, admin)

    assert data["appointments"] == {"value": 3, "previous": 2, "change_percent": 50.0}
    assert data["end"] == timezone.localdate().isoformat()


@pytest.mark.django_db
def test_earnings_leave_out_vat_and_count_only_paid_invoices(login_as, admin) -> None:
    def paid(total, vat, day):
        invoice = InvoiceFactory(
            clinic=admin.clinic,
            total=Decimal(total),
            vat_amount=Decimal(vat),
            status=Invoice.Status.PAID,
        )
        Invoice.objects.filter(pk=invoice.pk).update(paid_at=at_noon(day))

    paid("1130.00", "130.00", days_ago(1))  # this week: earned 1000, VAT 130
    paid("500.00", "0.00", days_ago(2))  # this week: earned 500
    paid("800.00", "0.00", days_ago(10))  # last week
    InvoiceFactory(clinic=admin.clinic, total=Decimal("999.00"))  # unpaid: not earned

    data = get_summary(login_as, admin)

    assert data["earnings"] == {"value": "1500.00", "previous": "800.00", "change_percent": 87.5}
    assert data["vat_collected"]["value"] == "130.00"
    assert data["unpaid_invoices"] == 1


@pytest.mark.django_db
def test_charts_group_appointments_by_status_and_department(login_as, admin) -> None:
    ent = DoctorProfileFactory(
        clinic=admin.clinic, department=DepartmentFactory(clinic=admin.clinic, name="ENT")
    )
    no_department = DoctorProfileFactory(clinic=admin.clinic, department=None)
    for hour, status in ((9, "BOOKED"), (10, "BOOKED"), (11, "COMPLETED")):
        AppointmentFactory(
            clinic=admin.clinic,
            doctor=ent,
            date=days_ago(1),
            start_time=datetime.time(hour, 0),
            end_time=datetime.time(hour, 20),
            status=status,
        )
    AppointmentFactory(
        clinic=admin.clinic, doctor=no_department, date=days_ago(2), status="CANCELLED"
    )

    data = get_summary(login_as, admin)

    assert data["appointments_by_status"] == [
        {"status": "BOOKED", "count": 2},
        {"status": "CANCELLED", "count": 1},
        {"status": "COMPLETED", "count": 1},
    ]
    assert data["appointments_by_department"] == [
        {"department": "ENT", "count": 3},
        {"department": "No department", "count": 1},
    ]


@pytest.mark.django_db
def test_people_lists_and_totals(login_as, admin) -> None:
    doctors = [DoctorProfileFactory(clinic=admin.clinic) for _ in range(6)]
    doctors[0].user.is_active = False
    doctors[0].user.save()
    patients = [PatientProfileFactory(clinic=admin.clinic) for _ in range(7)]

    data = get_summary(login_as, admin)

    assert data["total_doctors"] == 5  # active doctors only
    assert data["total_patients"] == 7
    assert len(data["recent_doctors"]) == 5
    assert data["recent_doctors"][0]["id"] == str(doctors[-1].id)  # newest first
    assert [p["id"] for p in data["new_patients_list"]] == [str(p.id) for p in patients[:1:-1]]


@pytest.mark.django_db
def test_new_patients_compare_registrations(login_as, admin) -> None:
    for days in (0, 1, 8):
        patient = PatientProfileFactory(clinic=admin.clinic)
        patient.__class__.objects.filter(pk=patient.pk).update(created_at=at_noon(days_ago(days)))
    assert get_summary(login_as, admin)["new_patients"] == {
        "value": 2,
        "previous": 1,
        "change_percent": 100.0,
    }


@pytest.mark.django_db
def test_stock_alerts_and_pending_lab_orders(login_as, admin) -> None:
    low = MedicineFactory(clinic=admin.clinic, reorder_level=10)
    MedicineBatchFactory(clinic=admin.clinic, medicine=low, quantity=5)
    plenty = MedicineFactory(clinic=admin.clinic, reorder_level=10)
    MedicineBatchFactory(
        clinic=admin.clinic, medicine=plenty, quantity=50, expiry_date=days_ago(-30)
    )  # expiring soon
    MedicineBatchFactory(
        clinic=admin.clinic, medicine=plenty, quantity=5, expiry_date=days_ago(3)
    )  # expired
    MedicineBatchFactory(
        clinic=admin.clinic, medicine=plenty, quantity=0, expiry_date=days_ago(3)
    )  # expired but empty: not counted
    LabOrderFactory(clinic=admin.clinic)
    LabOrderFactory(clinic=admin.clinic, status="SAMPLE_COLLECTED")
    LabOrderFactory(clinic=admin.clinic, status="COMPLETED")

    data = get_summary(login_as, admin)

    assert data["stock"] == {
        "low_stock_medicines": 1,
        "expiring_soon_batches": 1,
        "expired_batches": 1,
    }
    assert data["pending_lab_orders"] == 2
    assert MedicineBatch.objects.count() == 4


@pytest.mark.django_db
def test_month_range(login_as, admin) -> None:
    AppointmentFactory(clinic=admin.clinic, date=days_ago(20))
    AppointmentFactory(clinic=admin.clinic, date=days_ago(40))
    data = get_summary(login_as, admin, "month")
    assert (data["range"], data["appointments"]["value"], data["appointments"]["previous"]) == (
        "month",
        1,
        1,
    )


@pytest.mark.django_db
def test_unknown_range_is_refused(login_as, admin) -> None:
    assert login_as(admin).get(SUMMARY, {"range": "year"}).status_code == 400


@pytest.mark.django_db
def test_week_is_the_default(login_as, admin) -> None:
    assert login_as(admin).get(SUMMARY).data["range"] == "week"


# ---------- scoping ----------


@pytest.mark.django_db
def test_another_clinics_data_is_never_counted(login_as, admin) -> None:
    other = ClinicFactory()
    AppointmentFactory(clinic=other, date=days_ago(1))
    PatientProfileFactory(clinic=other)
    DoctorProfileFactory(clinic=other)
    paid = InvoiceFactory(clinic=other, status=Invoice.Status.PAID)
    Invoice.objects.filter(pk=paid.pk).update(paid_at=at_noon(days_ago(1)))

    data = get_summary(login_as, admin)

    assert data["appointments"]["value"] == 0
    assert data["total_patients"] == 0
    assert data["total_doctors"] == 0
    assert data["earnings"]["value"] == "0.00"
    assert data["recent_doctors"] == []


@pytest.mark.django_db
def test_doctor_sees_own_visits_and_patients_but_no_money_or_stock(login_as) -> None:
    mine = AppointmentFactory(date=days_ago(1))
    AppointmentFactory(clinic=mine.clinic, date=days_ago(1))  # a colleague's visit
    PatientProfileFactory(clinic=mine.clinic)  # not my patient

    data = get_summary(login_as, mine.doctor.user)

    assert data["appointments"]["value"] == 1
    assert data["total_patients"] == 1
    assert data["earnings"] is None and data["vat_collected"] is None
    assert data["unpaid_invoices"] is None
    assert data["stock"] is None


@pytest.mark.django_db
def test_front_desk_sees_work_and_stock_but_not_money(login_as) -> None:
    """Phase 12: the admin handles the money; the front desk & pharmacy still sees how
    many bills are unpaid (it collects them) and the stock problems (it runs the pharmacy)."""
    bill = InvoiceFactory(status="PAID", total=Decimal("700.00"))
    InvoiceFactory(clinic=bill.clinic, status="UNPAID")
    Invoice.objects.filter(pk=bill.pk).update(paid_at=at_noon(days_ago(1)))

    data = get_summary(login_as, UserFactory(clinic=bill.clinic, role=Role.STAFF))

    assert data["earnings"] is None and data["vat_collected"] is None
    assert data["unpaid_invoices"] == 1
    assert data["stock"] is not None
    assert data["cancelled_bills_to_review"] is None


@pytest.mark.django_db
def test_admin_sees_cancellations_to_review(login_as) -> None:
    flagged = InvoiceFactory(status="CANCELLED", cancel_needs_review=True)
    InvoiceFactory(clinic=flagged.clinic, status="CANCELLED")  # reviewed already
    data = get_summary(login_as, UserFactory(clinic=flagged.clinic, role=Role.CLINIC_ADMIN))
    assert data["cancelled_bills_to_review"] == 1
    assert data["earnings"] is not None


@pytest.mark.django_db
def test_lab_technician_sees_lab_money_and_pending_orders(login_as) -> None:
    order = LabOrderFactory()
    data = get_summary(login_as, UserFactory(clinic=order.clinic, role=Role.LAB_TECHNICIAN))
    assert data["pending_lab_orders"] == 1
    assert data["earnings"] is not None
    assert data["stock"] is None
    assert data["appointments"] is None


@pytest.mark.django_db
def test_summary_needs_login(api_client) -> None:
    assert api_client.get(SUMMARY).status_code == 401


@pytest.mark.django_db
def test_summary_uses_a_small_fixed_number_of_queries(
    login_as, admin, django_assert_max_num_queries
) -> None:
    for _ in range(5):
        AppointmentFactory(clinic=admin.clinic, date=days_ago(1))
        PatientProfileFactory(clinic=admin.clinic)
    client = login_as(admin)
    with django_assert_max_num_queries(25):  # does not grow with the number of rows
        client.get(SUMMARY)


@pytest.mark.django_db
def test_today_range_compares_with_yesterday(login_as, admin) -> None:
    AppointmentFactory(clinic=admin.clinic, date=days_ago(0))
    AppointmentFactory(clinic=admin.clinic, date=days_ago(1))
    AppointmentFactory(clinic=admin.clinic, date=days_ago(1))  # another doctor
    data = get_summary(login_as, admin, "today")
    assert data["appointments"] == {"value": 1, "previous": 2, "change_percent": -50.0}
    assert data["start"] == data["end"]


@pytest.mark.django_db
def test_front_desk_sees_how_many_lab_registrations_need_checking(login_as, admin) -> None:
    PatientProfileFactory(clinic=admin.clinic, needs_review=True)
    PatientProfileFactory(clinic=admin.clinic)
    PatientProfileFactory(needs_review=True)  # another clinic
    assert get_summary(login_as, admin)["patients_to_check"] == 1
    lab_tech = UserFactory(clinic=admin.clinic, role=Role.LAB_TECHNICIAN)
    assert get_summary(login_as, lab_tech)["patients_to_check"] is None
