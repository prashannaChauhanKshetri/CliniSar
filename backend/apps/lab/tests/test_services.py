"""Tests for the lab service: ordering, Lab No., status steps, results and the LAB bill."""

from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, PatientProfileFactory, UserFactory
from apps.billing.models import Invoice
from apps.clinics.tests.factories import ClinicFactory
from apps.lab import services
from apps.lab.models import LabOrder, LabResult, LabTestParameter
from apps.lab.tests.factories import LabTestFactory
from apps.scheduling.models import Appointment
from apps.scheduling.tests.factories import AppointmentFactory

pytestmark = pytest.mark.django_db
Status = LabOrder.Status


@pytest.fixture
def visit():
    return AppointmentFactory()


@pytest.fixture
def lab_tech(visit) -> User:
    return UserFactory(clinic=visit.clinic, role=User.Role.LAB_TECHNICIAN)


def order_from(visit, *tests):
    """A doctor orders tests from their own visit."""
    tests = list(tests) or [LabTestFactory(clinic=visit.clinic)]
    return services.create_lab_order(
        clinic=visit.clinic, tests=tests, ordered_by=visit.doctor.user, appointment=visit
    )


def results_for(order, value="15.1", flag="NORMAL") -> list[dict]:
    """A result for every parameter of every test in the order."""
    return [
        {"parameter": parameter.pk, "value": value, "flag": flag}
        for item in order.items.all()
        for parameter in item.lab_test.parameters.all()
    ]


# ---------- ordering ----------


def test_doctor_orders_tests_from_own_visit(visit) -> None:
    cbc = LabTestFactory(clinic=visit.clinic, name="CBC")
    rbs = LabTestFactory(clinic=visit.clinic, name="RBS")

    order = order_from(visit, cbc, rbs)

    assert order.status == Status.ORDERED
    assert order.patient == visit.patient
    assert order.lab_number == 1
    assert sorted(order.items.values_list("lab_test__name", flat=True)) == ["CBC", "RBS"]


def test_lab_numbers_are_sequential_per_clinic(visit) -> None:
    numbers = [order_from(visit).lab_number for _ in range(3)]
    other = AppointmentFactory()
    assert numbers == [1, 2, 3]
    assert order_from(other).lab_number == 1


def test_order_creates_one_lab_bill_with_a_line_per_test(visit) -> None:
    cbc = LabTestFactory(clinic=visit.clinic, name="CBC", price=Decimal("500.00"))
    lft = LabTestFactory(clinic=visit.clinic, name="LFT", price=Decimal("1200.00"))

    order = order_from(visit, cbc, lft)

    invoice = Invoice.objects.get(lab_order=order)
    assert invoice.source == Invoice.Source.LAB
    assert invoice.total == Decimal("1700.00")
    assert sorted(invoice.items.values_list("description", "unit_price")) == [
        ("CBC", Decimal("500.00")),
        ("LFT", Decimal("1200.00")),
    ]


def test_lab_bill_uses_the_lab_bill_book_when_separate() -> None:
    clinic = ClinicFactory(
        lab_bills_separately=True, lab_name="Sample Path Lab", lab_pan_number="2"
    )
    visit = AppointmentFactory(clinic=clinic)
    invoice = Invoice.objects.get(lab_order=order_from(visit))
    assert (invoice.series, invoice.number, invoice.issuer_name) == ("LAB", 1, "Sample Path Lab")


def test_lab_staff_order_for_a_self_referred_patient(lab_tech) -> None:
    patient = PatientProfileFactory(clinic=lab_tech.clinic)
    order = services.create_lab_order(
        clinic=lab_tech.clinic,
        tests=[LabTestFactory(clinic=lab_tech.clinic)],
        ordered_by=lab_tech,
        patient=patient,
    )
    assert order.appointment is None
    assert order.patient == patient


def test_doctor_cannot_order_without_a_visit(visit) -> None:
    with pytest.raises(ValidationError):
        services.create_lab_order(
            clinic=visit.clinic,
            tests=[LabTestFactory(clinic=visit.clinic)],
            ordered_by=visit.doctor.user,
            patient=visit.patient,
        )


def test_doctor_cannot_order_for_a_colleagues_visit(visit) -> None:
    colleague = DoctorProfileFactory(clinic=visit.clinic)
    with pytest.raises(ValidationError):
        services.create_lab_order(
            clinic=visit.clinic,
            tests=[LabTestFactory(clinic=visit.clinic)],
            ordered_by=colleague.user,
            appointment=visit,
        )


def test_no_order_for_a_cancelled_visit() -> None:
    visit = AppointmentFactory(status=Appointment.Status.CANCELLED)
    with pytest.raises(ValidationError):
        order_from(visit)


def test_patient_must_match_the_visit(visit, lab_tech) -> None:
    stranger = PatientProfileFactory(clinic=visit.clinic)
    with pytest.raises(ValidationError):
        services.create_lab_order(
            clinic=visit.clinic,
            tests=[LabTestFactory(clinic=visit.clinic)],
            ordered_by=lab_tech,
            appointment=visit,
            patient=stranger,
        )


def test_tests_must_be_chosen_once_and_still_offered(visit) -> None:
    cbc = LabTestFactory(clinic=visit.clinic)
    retired = LabTestFactory(clinic=visit.clinic, is_active=False)
    for tests in ([], [cbc, cbc], [retired]):
        with pytest.raises(ValidationError):
            services.create_lab_order(
                clinic=visit.clinic, tests=tests, ordered_by=visit.doctor.user, appointment=visit
            )
    assert not LabOrder.objects.exists()


# ---------- status steps ----------


def test_full_path_ordered_collected_completed(visit, lab_tech) -> None:
    order = order_from(visit)

    services.collect_sample(order, user=lab_tech)
    order.refresh_from_db()
    assert (order.status, order.collected_by) == (Status.SAMPLE_COLLECTED, lab_tech)
    assert order.collected_at is not None

    services.complete_lab_order(order, user=lab_tech, results=results_for(order))
    order.refresh_from_db()
    assert (order.status, order.completed_by) == (Status.COMPLETED, lab_tech)
    assert order.completed_at is not None


@pytest.mark.parametrize(
    ("setup", "step"),
    [
        ([], "complete"),  # cannot skip sample collection
        (["collect"], "collect"),  # cannot collect twice
        (["collect"], "cancel"),  # cancel only before the sample is taken
        (["collect", "complete"], "complete"),  # cannot complete twice
        (["collect", "complete"], "cancel"),
        (["cancel"], "collect"),  # a cancelled order is finished
        (["cancel"], "cancel"),
    ],
)
def test_any_other_status_change_is_refused(visit, lab_tech, setup, step) -> None:
    order = order_from(visit)
    steps = {
        "collect": lambda: services.collect_sample(order, user=lab_tech),
        "complete": lambda: services.complete_lab_order(
            order, user=lab_tech, results=results_for(order)
        ),
        "cancel": lambda: services.cancel_lab_order(order, reason="x"),
    }
    for done in setup:
        steps[done]()
    order.refresh_from_db()
    status_before = order.status

    with pytest.raises(ValidationError):
        steps[step]()

    order.refresh_from_db()
    assert order.status == status_before


def test_cancelling_an_order_cancels_its_unpaid_bill(visit) -> None:
    order = services.cancel_lab_order(order_from(visit), reason="Patient left")
    invoice = Invoice.objects.get(lab_order=order)
    assert invoice.status == Invoice.Status.CANCELLED
    assert invoice.cancel_reason == "Lab order cancelled: Patient left"


# ---------- results ----------


def test_completing_stores_a_copy_of_every_row_with_value_and_flag(visit, lab_tech) -> None:
    cbc = LabTestFactory(clinic=visit.clinic, parameters=[("Hemoglobin (Hb)", "gm%", "11-16")])
    order = order_from(visit, cbc)
    services.collect_sample(order, user=lab_tech)

    services.complete_lab_order(
        order, user=lab_tech, results=results_for(order, value="9.8", flag="ABNORMAL")
    )

    result = LabResult.objects.get()
    assert (result.name, result.unit, result.reference_range) == ("Hemoglobin (Hb)", "gm%", "11-16")
    assert (result.value, result.flag) == ("9.8", "ABNORMAL")


def test_every_row_needs_a_result(visit, lab_tech) -> None:
    order = order_from(visit)  # one test with two rows
    services.collect_sample(order, user=lab_tech)

    with pytest.raises(ValidationError) as error:
        services.complete_lab_order(order, user=lab_tech, results=results_for(order)[:1])

    assert "ESR" in str(error.value.detail)
    order.refresh_from_db()
    assert order.status == Status.SAMPLE_COLLECTED
    assert not LabResult.objects.exists()


def test_results_for_other_tests_are_refused(visit, lab_tech) -> None:
    order = order_from(visit)
    services.collect_sample(order, user=lab_tech)
    unrelated = LabTestFactory(clinic=visit.clinic).parameters.first()
    extra = {"parameter": unrelated.pk, "value": "1", "flag": "NORMAL"}

    with pytest.raises(ValidationError):
        services.complete_lab_order(order, user=lab_tech, results=[*results_for(order), extra])


def test_editing_a_test_later_never_changes_a_finished_report(visit, lab_tech) -> None:
    cbc = LabTestFactory(clinic=visit.clinic, parameters=[("Hemoglobin (Hb)", "gm%", "11-16")])
    order = order_from(visit, cbc)
    services.collect_sample(order, user=lab_tech)
    services.complete_lab_order(order, user=lab_tech, results=results_for(order))

    services.save_parameters(
        cbc, [{"name": "Haemoglobin", "unit": "g/dL", "reference_range": "12-15"}]
    )

    result = LabResult.objects.get()
    assert (result.name, result.unit, result.reference_range) == ("Hemoglobin (Hb)", "gm%", "11-16")


# ---------- editing parameters ----------


def test_save_parameters_updates_adds_and_removes_rows() -> None:
    lab_test = LabTestFactory(parameters=[("Hb", "gm%", "11-16"), ("ESR", "mm/hr", "0-20")])
    hb = lab_test.parameters.get(name="Hb")

    services.save_parameters(
        lab_test,
        [
            {"name": "Platelets", "unit": "Lakh/cumm", "reference_range": "1.5-4.5"},
            {"id": hb.pk, "name": "Hb", "unit": "gm%", "reference_range": "12-16"},
        ],
    )

    rows = list(lab_test.parameters.values_list("name", "reference_range", "position"))
    assert rows == [("Platelets", "1.5-4.5", 0), ("Hb", "12-16", 1)]  # ESR removed
    assert LabTestParameter.objects.filter(pk=hb.pk).exists()  # same row, edited


def test_save_parameters_refuses_a_row_of_another_test() -> None:
    lab_test, other = LabTestFactory(), LabTestFactory()
    foreign = other.parameters.first()
    with pytest.raises(ValidationError):
        services.save_parameters(lab_test, [{"id": foreign.pk, "name": "x"}])
