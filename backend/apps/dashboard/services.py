"""Numbers for the dashboard, worked out with a few database queries.

Ranges are rolling, in Nepal time: "week" is the last 7 days including today and
"month" the last 30 days. Each is compared with the period of the same length just
before it. (Calendar months would not line up with the Bikram Sambat months that the
screens show, so rolling ranges are used.)

What a user sees depends on their role (see scope_for). Numbers a role may not see
are returned as None.
"""

import datetime
from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Count, F, Q, QuerySet, Sum
from django.utils import timezone

from apps.accounts.models import DoctorProfile, PatientProfile, User
from apps.billing.models import Invoice
from apps.lab.models import LabOrder
from apps.pharmacy.models import Medicine, MedicineBatch
from apps.pharmacy.services import EXPIRING_SOON_DAYS
from apps.scheduling.models import Appointment

# "today" compares today with yesterday; it feeds the task-first dashboard.
RANGE_DAYS = {"today": 1, "week": 7, "month": 30}
Role = User.Role


@dataclass(frozen=True)
class Period:
    """A run of whole days, first and last day included."""

    first: datetime.date
    last: datetime.date


def periods(range_name: str, today: datetime.date) -> tuple[Period, Period]:
    """The current range ending today, and the range of the same length before it."""
    days = RANGE_DAYS[range_name]
    current = Period(today - datetime.timedelta(days=days - 1), today)
    previous = Period(
        current.first - datetime.timedelta(days=days), current.first - datetime.timedelta(days=1)
    )
    return current, previous


def change_percent(current, previous) -> float | None:
    """Percentage change, rounded to one decimal; None when there is nothing to compare."""
    if not previous:
        return None
    return round(float((current - previous) / previous * 100), 1)


# ---------- what each role may see ----------


@dataclass(frozen=True)
class Scope:
    """The slices of clinic data one user's dashboard is built from (None = hidden)."""

    appointments: QuerySet | None
    patients: QuerySet | None
    invoices: QuerySet | None
    lab_orders: QuerySet | None
    show_stock: bool
    # EN: Earnings and VAT. The admin handles the clinic's money (phase 12), so the front
    #     desk & pharmacy no longer see them; the lab still sees its own, as before.
    # NP: Kati kamayo bhanne figure admin le matra herne. Front desk le unpaid bill ko
    #     count chai dekhcha, kina bhane paisa usle nai uthauncha.
    show_money: bool = True


def scope_for(user: User) -> Scope:
    """Narrow every number to the user's clinic, then to what their role may see."""
    clinic = user.clinic
    appointments = Appointment.objects.filter(clinic=clinic)
    patients = PatientProfile.objects.filter(clinic=clinic)
    invoices = Invoice.objects.filter(clinic=clinic)
    lab_orders = LabOrder.objects.filter(clinic=clinic)

    if user.role == Role.CLINIC_ADMIN:
        return Scope(appointments, patients, invoices, lab_orders, show_stock=True)
    if user.role == Role.STAFF:
        return Scope(
            appointments, patients, invoices, lab_orders, show_stock=True, show_money=False
        )
    if user.role == Role.DOCTOR:
        own_patients = appointments.filter(doctor__user=user).values("patient")
        return Scope(
            appointments.filter(doctor__user=user),
            patients.filter(pk__in=own_patients),
            None,  # doctors do not see money
            lab_orders.filter(patient__in=own_patients),
            show_stock=False,
        )
    if user.role == Role.LAB_TECHNICIAN:
        return Scope(None, None, invoices.filter(source=Invoice.Source.LAB), lab_orders, False)
    return Scope(None, None, None, None, show_stock=False)


# ---------- the separate numbers ----------


def count_in(queryset: QuerySet, field: str, period: Period) -> int:
    return queryset.filter(**{f"{field}__gte": period.first, f"{field}__lte": period.last}).count()


def comparison(value, previous) -> dict:
    """{"value", "previous", "change_percent"}; money is sent as exact decimal text."""
    as_text = isinstance(value, Decimal)
    return {
        "value": str(value) if as_text else value,
        "previous": str(previous) if as_text else previous,
        "change_percent": change_percent(value, previous),
    }


def compare_counts(queryset: QuerySet | None, field: str, current: Period, previous: Period):
    """Count rows in both periods, or None if the role may not see them."""
    if queryset is None:
        return None
    return comparison(count_in(queryset, field, current), count_in(queryset, field, previous))


def money_in(invoices: QuerySet, period: Period) -> tuple[Decimal, Decimal]:
    """(earnings, VAT) of invoices PAID in the period. Earnings leave out the VAT,
    because VAT is collected for the government, not earned by the clinic."""
    paid = invoices.filter(
        status=Invoice.Status.PAID,
        paid_at__date__gte=period.first,
        paid_at__date__lte=period.last,
    ).aggregate(total=Sum("total"), vat=Sum("vat_amount"))
    total, vat = paid["total"] or Decimal("0.00"), paid["vat"] or Decimal("0.00")
    return total - vat, vat


def compare_money(invoices: QuerySet | None, current: Period, previous: Period):
    """(earnings, VAT) comparisons, or (None, None) if the role may not see money."""
    if invoices is None:
        return None, None
    earned, vat = money_in(invoices, current)
    earned_before, vat_before = money_in(invoices, previous)
    return comparison(earned, earned_before), comparison(vat, vat_before)


def by_status(appointments: QuerySet, period: Period) -> list[dict]:
    """Appointments in the period per status, for the donut chart."""
    rows = (
        appointments.filter(date__gte=period.first, date__lte=period.last)
        .values("status")
        .annotate(count=Count("id"))
        .order_by("status")
    )
    return [{"status": row["status"], "count": row["count"]} for row in rows]


def by_department(appointments: QuerySet, period: Period) -> list[dict]:
    """Appointments in the period per department, for the bar chart (busiest first)."""
    rows = (
        appointments.filter(date__gte=period.first, date__lte=period.last)
        .values(department=F("doctor__department__name"))
        .annotate(count=Count("id"))
        .order_by("-count", "department")
    )
    return [
        {"department": row["department"] or "No department", "count": row["count"]} for row in rows
    ]


def recent_doctors(clinic) -> list[dict]:
    """The 5 doctors added most recently, with an active flag for the status badge."""
    doctors = (
        DoctorProfile.objects.filter(user__clinic=clinic)
        .select_related("user", "department")
        .order_by("-created_at")[:5]
    )
    return [
        {
            "id": str(doctor.id),
            "name": doctor.user.get_full_name(),
            "department": doctor.department.name if doctor.department else None,
            "specialization": doctor.specialization,
            "is_active": doctor.user.is_active,
        }
        for doctor in doctors
    ]


def newest_patients(patients: QuerySet, today: datetime.date) -> list[dict]:
    """The 5 patients registered most recently."""
    return [
        {
            "id": str(patient.id),
            "name": patient.full_name,
            "age": patient.age_on(today),
            "gender": patient.gender,
            "address": patient.address,
            "created_at": patient.created_at.isoformat(),
        }
        for patient in patients.order_by("-created_at")[:5]
    ]


def stock_alerts(clinic, today: datetime.date) -> dict:
    """Counts for the pharmacy: low-stock medicines, expiring and expired batches."""
    in_stock = MedicineBatch.objects.filter(clinic=clinic, quantity__gt=0)
    soon = today + datetime.timedelta(days=EXPIRING_SOON_DAYS)
    low_stock = (
        Medicine.objects.filter(clinic=clinic)
        .with_available_stock()
        .filter(available_stock__lte=F("reorder_level"))
        .count()
    )
    return {
        "low_stock_medicines": low_stock,
        "expiring_soon_batches": in_stock.filter(
            expiry_date__gte=today, expiry_date__lte=soon
        ).count(),
        "expired_batches": in_stock.filter(expiry_date__lt=today).count(),
    }


# ---------- the whole summary ----------


def summary(user: User, range_name: str) -> dict:
    """Everything the dashboard shows, for this user and range."""
    today = timezone.localdate()
    current, previous = periods(range_name, today)
    scope = scope_for(user)
    earnings, vat_collected = compare_money(
        scope.invoices if scope.show_money else None, current, previous
    )
    is_admin = user.role == Role.CLINIC_ADMIN
    pending_lab = Q(status__in=[LabOrder.Status.ORDERED, LabOrder.Status.SAMPLE_COLLECTED])

    return {
        "range": range_name,
        "start": current.first.isoformat(),
        "end": current.last.isoformat(),
        "total_patients": scope.patients.count() if scope.patients is not None else None,
        "total_doctors": DoctorProfile.objects.filter(
            user__clinic=user.clinic, user__is_active=True
        ).count(),
        "new_patients": compare_counts(scope.patients, "created_at__date", current, previous),
        "appointments": compare_counts(scope.appointments, "date", current, previous),
        "earnings": earnings,
        "vat_collected": vat_collected,
        "appointments_by_status": by_status(scope.appointments, current)
        if scope.appointments is not None
        else None,
        "appointments_by_department": by_department(scope.appointments, current)
        if scope.appointments is not None
        else None,
        "recent_doctors": recent_doctors(user.clinic),
        "new_patients_list": newest_patients(scope.patients, today)
        if scope.patients is not None
        else None,
        "stock": stock_alerts(user.clinic, today) if scope.show_stock else None,
        "pending_lab_orders": scope.lab_orders.filter(pending_lab).count()
        if scope.lab_orders is not None
        else None,
        "patients_to_check": PatientProfile.objects.filter(
            clinic=user.clinic, needs_review=True
        ).count()
        if user.role in (Role.CLINIC_ADMIN, Role.STAFF)
        else None,
        "unpaid_invoices": scope.invoices.filter(status=Invoice.Status.UNPAID).count()
        if scope.invoices is not None
        else None,
        # Bills the front desk & pharmacy cancelled that the admin has not seen yet.
        "cancelled_bills_to_review": Invoice.objects.filter(
            clinic=user.clinic, cancel_needs_review=True
        ).count()
        if is_admin
        else None,
    }
