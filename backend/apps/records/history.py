"""A patient's history on one screen, for the doctor (phase 12).

EN: Many patients come again and again (sugar, pressure, thyroid...). Before seeing
    them, the doctor wants: how many times have they come, what was found last time,
    which medicines they are on, and how their lab values are moving. This module
    gathers all of that in a few queries, so the screen needs only one request.
NP: Yar, dherai patient feri feri aauchan (sugar, pressure...). Doctor lai chahincha:
    kati choti aayo, last time ke bhayo, ke ausadhi khadai cha, ra lab ko value
    badhdai cha ki ghatdai. Yo file le sab ekai choti nikalcha, screen ma ek request.
"""

from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Max, Min

from apps.accounts.models import PatientProfile
from apps.lab.models import LabOrder, LabResult
from apps.scheduling.models import Appointment

from .models import Prescription

RECENT_VISITS = 5  # how many past visits the panel lists
TREND_POINTS = 10  # newest values kept per lab parameter
TREND_PARAMETERS = 12  # lab parameters shown: repeated ones first, then the newest


def as_number(value: str) -> float | None:
    """'182' -> 182.0, '15.1' -> 15.1; text results ('Non-Reactive', '1-2/HPF') -> None.

    NP: Lab result text ma huncha. Number bhaye matra graph banaucha, natra skip.
    """
    try:
        return float(Decimal(value.strip()))
    except InvalidOperation, ValueError:
        return None


def visit_summary(patient: PatientProfile) -> dict:
    """How many times the patient was seen, and the first and last visit dates."""
    seen = Appointment.objects.filter(patient=patient, status=Appointment.Status.COMPLETED)
    numbers = seen.aggregate(count=Count("id"), first=Min("date"), last=Max("date"))
    return {
        "count": numbers["count"],
        "first": numbers["first"].isoformat() if numbers["first"] else None,
        "last": numbers["last"].isoformat() if numbers["last"] else None,
    }


def recent_visits(patient: PatientProfile) -> list[dict]:
    """The last few completed visits, with the diagnosis written in that visit."""
    visits = (
        Appointment.objects.filter(patient=patient, status=Appointment.Status.COMPLETED)
        .select_related("doctor__user", "prescription")
        .order_by("-date", "-start_time")[:RECENT_VISITS]
    )
    rows = []
    for visit in visits:
        prescription = getattr(visit, "prescription", None)  # a visit may have none
        rows.append(
            {
                "date": visit.date.isoformat(),
                "doctor_name": visit.doctor.user.get_full_name(),
                "reason": visit.reason,
                "diagnosis": prescription.diagnosis if prescription else None,
            }
        )
    return rows


def recent_medicines(patient: PatientProfile) -> dict | None:
    """The medicines of the newest prescription: what the patient is probably taking now."""
    latest = (
        Prescription.objects.filter(appointment__patient=patient)
        .select_related("appointment")
        .prefetch_related("items__medicine")
        .order_by("-appointment__date", "-created_at")
        .first()
    )
    if latest is None:
        return None
    return {
        "date": latest.appointment.date.isoformat(),
        "diagnosis": latest.diagnosis,
        "items": [
            {
                "medicine": f"{item.medicine.name} {item.medicine.strength}".strip(),
                "dosage": item.dosage,
                "frequency": item.frequency,
                "duration_days": item.duration_days,
            }
            for item in latest.items.all()
        ],
    }


def lab_trends(patient: PatientProfile) -> list[dict]:
    """Numeric lab results over time, one series per parameter (e.g. Random Blood Sugar).

    Results are grouped by the name and unit copied into each result, so a series stays
    correct even if the lab test is renamed later.

    NP: Euta parameter (jasto RBS) ko sabai value date anusar line ma rakhcha, graph ko
        lagi. Text wala result (Non-Reactive) yaha aaudaina.
    """
    results = (
        LabResult.objects.filter(
            item__order__patient=patient, item__order__status=LabOrder.Status.COMPLETED
        )
        .select_related("item__order")
        .order_by("item__order__completed_at")
    )
    series: dict[tuple[str, str], dict] = {}
    points: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for result in results:
        number = as_number(result.value)
        if number is None:
            continue
        key = (result.name, result.unit)
        series.setdefault(
            key,
            {"name": result.name, "unit": result.unit, "reference_range": result.reference_range},
        )
        completed = result.item.order.completed_at
        points[key].append(
            {
                "date": completed.date().isoformat() if completed else None,
                "value": number,
                "flag": result.flag,
            }
        )
    trends = [{**series[key], "points": points[key][-TREND_POINTS:]} for key in series]
    # Values measured more than once come first (those are what the doctor follows, e.g.
    # sugar), then the most recently measured. NP: Graph banne wala pahila.
    trends.sort(
        key=lambda trend: (len(trend["points"]) > 1, trend["points"][-1]["date"] or ""),
        reverse=True,
    )
    return trends[:TREND_PARAMETERS]


def patient_history(patient: PatientProfile) -> dict:
    """Everything the history panel shows."""
    return {
        "visits": visit_summary(patient),
        "recent_visits": recent_visits(patient),
        "current_medicines": recent_medicines(patient),
        "lab_trends": lab_trends(patient),
    }
