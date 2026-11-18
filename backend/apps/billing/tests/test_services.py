"""Tests for the invoice service: maths, VAT, numbering, creation, payment, cancellation."""

from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.accounts.tests.factories import UserFactory
from apps.billing import services
from apps.billing.models import Invoice
from apps.billing.services import Line
from apps.clinics.tests.factories import ClinicFactory
from apps.lab.tests.factories import LabOrderFactory
from apps.records.tests.factories import PrescriptionFactory
from apps.scheduling.tests.factories import AppointmentFactory

D = Decimal
Source = Invoice.Source


# ---------- maths (no database needed) ----------


def test_totals_without_discount_or_vat() -> None:
    totals = services.calculate_totals([D("500.00"), D("250.50")], D("0"), D("0"))
    assert totals == services.Totals(D("750.50"), D("0.00"), D("750.50"))


def test_vat_is_calculated_on_the_amount_after_discount() -> None:
    # subtotal 1000, discount 100 -> taxable 900; VAT 13% of 900 = 117.00
    totals = services.calculate_totals([D("1000.00")], D("100.00"), D("13.00"))
    assert totals.subtotal == D("1000.00")
    assert totals.vat_amount == D("117.00")
    assert totals.total == D("1017.00")


def test_vat_is_rounded_half_up_to_paisa() -> None:
    # 0.50 x 13% = 0.065 -> 0.07 (half up). Banker's rounding would give 0.06.
    assert services.calculate_totals([D("0.50")], D("0"), D("13")).vat_amount == D("0.07")
    # 999.99 x 13% = 129.9987 -> 130.00
    assert services.calculate_totals([D("999.99")], D("0"), D("13")).vat_amount == D("130.00")
    # 333.33 x 5% = 16.6665 -> 16.67
    assert services.calculate_totals([D("333.33")], D("0"), D("5")).vat_amount == D("16.67")


def test_full_discount_gives_zero_total() -> None:
    totals = services.calculate_totals([D("700.00")], D("700.00"), D("13"))
    assert totals.total == D("0.00")


@pytest.mark.parametrize("discount", [D("-1"), D("700.01")])
def test_discount_outside_0_to_subtotal_is_refused(discount) -> None:
    with pytest.raises(ValidationError):
        services.calculate_totals([D("700.00")], discount, D("0"))


def test_line_total_is_quantity_times_price() -> None:
    assert Line("Paracetamol", 15, D("2.50")).line_total == D("37.50")


# ---------- VAT per source ----------


def make_invoice(source: str, clinic=None, lines=None) -> Invoice:
    """Create an invoice of the given source through the real service."""
    clinic = clinic or ClinicFactory()
    lines = lines or [Line("Item", 1, D("1000.00"))]
    link = {
        Source.CONSULTATION: lambda: {"appointment": AppointmentFactory(clinic=clinic)},
        Source.PHARMACY: lambda: {"prescription": PrescriptionFactory(clinic=clinic)},
        Source.LAB: lambda: {"lab_order": LabOrderFactory(clinic=clinic)},
    }[source]()
    patient = next(iter(link.values())).patient if source == Source.LAB else None
    if patient is None:
        obj = next(iter(link.values()))
        patient = obj.patient if hasattr(obj, "patient") else obj.appointment.patient
    return services.create_invoice(
        clinic=clinic, patient=patient, source=source, lines=lines, **link
    )


SWITCH = {
    Source.CONSULTATION: "vat_on_consultation",
    Source.PHARMACY: "vat_on_pharmacy",
    Source.LAB: "vat_on_lab",
}


@pytest.mark.django_db
@pytest.mark.parametrize("source", list(Source))
def test_vat_off_for_a_source_means_rate_zero(source) -> None:
    clinic = ClinicFactory(vat_rate=D("13.00"))  # every switch is off by default
    invoice = make_invoice(source, clinic)
    assert invoice.vat_rate == D("0")
    assert invoice.vat_amount == D("0.00")
    assert invoice.total == D("1000.00")


@pytest.mark.django_db
@pytest.mark.parametrize("source", list(Source))
def test_vat_on_for_a_source_uses_the_clinic_rate(source) -> None:
    clinic = ClinicFactory(vat_rate=D("13.00"), **{SWITCH[source]: True})
    invoice = make_invoice(source, clinic)
    assert invoice.vat_rate == D("13.00")
    assert invoice.vat_amount == D("130.00")
    assert invoice.total == D("1130.00")


@pytest.mark.django_db
@pytest.mark.parametrize("source", list(Source))
def test_vat_switch_of_one_source_does_not_affect_the_others(source) -> None:
    others_on = {switch: True for src, switch in SWITCH.items() if src != source}
    clinic = ClinicFactory(**others_on)
    assert make_invoice(source, clinic).vat_rate == D("0")


@pytest.mark.django_db
def test_any_vat_rate_can_be_used_for_example_5_percent() -> None:
    clinic = ClinicFactory(vat_rate=D("5.00"), vat_on_lab=True)
    invoice = make_invoice(Source.LAB, clinic)
    assert invoice.vat_amount == D("50.00")


@pytest.mark.django_db
def test_changing_vat_settings_never_changes_existing_invoices() -> None:
    clinic = ClinicFactory(vat_rate=D("13.00"), vat_on_pharmacy=True)
    old = make_invoice(Source.PHARMACY, clinic)

    clinic.vat_rate = D("5.00")
    clinic.vat_on_pharmacy = False
    clinic.save()
    new = make_invoice(Source.PHARMACY, clinic)

    old.refresh_from_db()
    assert (old.vat_rate, old.vat_amount, old.total) == (D("13.00"), D("130.00"), D("1130.00"))
    assert (new.vat_rate, new.total) == (D("0"), D("1000.00"))


# ---------- creation and numbering ----------


@pytest.mark.django_db
def test_lines_are_copied_onto_the_invoice() -> None:
    lines = [Line("Paracetamol 500mg", 15, D("2.50")), Line("Cough syrup", 1, D("120.00"))]
    invoice = make_invoice(Source.PHARMACY, lines=lines)

    items = list(invoice.items.values_list("description", "quantity", "unit_price", "line_total"))
    assert items == [
        ("Paracetamol 500mg", 15, D("2.50"), D("37.50")),
        ("Cough syrup", 1, D("120.00"), D("120.00")),
    ]
    assert invoice.subtotal == D("157.50")
    assert invoice.status == Invoice.Status.UNPAID


@pytest.mark.django_db
def test_invoice_numbers_are_sequential_per_clinic() -> None:
    clinic_a, clinic_b = ClinicFactory(), ClinicFactory()
    numbers_a = [make_invoice(Source.CONSULTATION, clinic_a).number for _ in range(3)]
    numbers_b = [make_invoice(Source.CONSULTATION, clinic_b).number for _ in range(2)]

    assert numbers_a == [1, 2, 3]
    assert numbers_b == [1, 2]
    clinic_a.refresh_from_db()
    assert clinic_a.last_invoice_number == 3


@pytest.mark.django_db
def test_all_sources_share_one_sequence_when_lab_does_not_bill_separately() -> None:
    clinic = ClinicFactory()
    numbers = [make_invoice(source, clinic).number for source in Source]
    assert numbers == [1, 2, 3]


@pytest.mark.django_db
def test_lab_with_its_own_bill_book_gets_its_own_numbers_name_and_pan() -> None:
    clinic = ClinicFactory(
        name="Sample Clinic",
        pan_number="111111111",
        lab_bills_separately=True,
        lab_name="Sample Path Lab",
        lab_pan_number="222222222",
    )
    consultation = make_invoice(Source.CONSULTATION, clinic)
    lab_1 = make_invoice(Source.LAB, clinic)
    lab_2 = make_invoice(Source.LAB, clinic)
    pharmacy = make_invoice(Source.PHARMACY, clinic)

    assert (consultation.series, consultation.number) == ("CLINIC", 1)
    assert (pharmacy.series, pharmacy.number) == ("CLINIC", 2)
    assert [(lab.series, lab.number) for lab in (lab_1, lab_2)] == [("LAB", 1), ("LAB", 2)]
    assert (lab_1.issuer_name, lab_1.issuer_pan) == ("Sample Path Lab", "222222222")
    assert (pharmacy.issuer_name, pharmacy.issuer_pan) == ("Sample Clinic", "111111111")


@pytest.mark.django_db
def test_issuer_details_on_old_invoices_do_not_change_with_settings() -> None:
    clinic = ClinicFactory(name="Old Name", pan_number="111111111")
    invoice = make_invoice(Source.CONSULTATION, clinic)
    clinic.name, clinic.pan_number = "New Name", "999999999"
    clinic.save()
    invoice.refresh_from_db()
    assert (invoice.issuer_name, invoice.issuer_pan) == ("Old Name", "111111111")


# ---------- paying ----------


@pytest.mark.django_db
def test_paying_records_method_time_and_cashier() -> None:
    invoice = make_invoice(Source.CONSULTATION)
    cashier = UserFactory(clinic=invoice.clinic)

    paid = services.pay_invoice(invoice, payment_method="CASH", received_by=cashier)

    assert paid.status == Invoice.Status.PAID
    assert paid.payment_method == "CASH"
    assert paid.received_by == cashier
    assert paid.paid_at is not None


@pytest.mark.django_db
def test_discount_at_payment_recalculates_vat_and_total() -> None:
    clinic = ClinicFactory(vat_rate=D("13.00"), vat_on_consultation=True)
    invoice = make_invoice(Source.CONSULTATION, clinic)  # 1000 + 130 VAT
    cashier = UserFactory(clinic=clinic)

    paid = services.pay_invoice(
        invoice, payment_method="CARD", received_by=cashier, discount=D("100.00")
    )

    assert (paid.discount, paid.vat_amount, paid.total) == (D("100.00"), D("117.00"), D("1017.00"))
    assert paid.subtotal == D("1000.00")


@pytest.mark.django_db
def test_paid_invoice_is_locked() -> None:
    invoice = make_invoice(Source.CONSULTATION)
    cashier = UserFactory(clinic=invoice.clinic)
    services.pay_invoice(invoice, payment_method="CASH", received_by=cashier)

    with pytest.raises(ValidationError):
        services.pay_invoice(invoice, payment_method="CARD", received_by=cashier)
    with pytest.raises(ValidationError):
        services.cancel_invoice(invoice, reason="Mistake")

    invoice.refresh_from_db()
    assert (invoice.status, invoice.payment_method) == (Invoice.Status.PAID, "CASH")


# ---------- cancelling ----------


@pytest.mark.django_db
def test_cancelled_invoice_cannot_be_paid() -> None:
    invoice = services.cancel_invoice(make_invoice(Source.LAB), reason="Entered twice")
    assert invoice.cancel_reason == "Entered twice"
    with pytest.raises(ValidationError):
        services.pay_invoice(invoice, payment_method="CASH", received_by=UserFactory())


@pytest.mark.django_db
def test_cancel_unpaid_invoice_of_leaves_paid_invoices_alone() -> None:
    invoice = make_invoice(Source.CONSULTATION)
    services.pay_invoice(invoice, payment_method="CASH", received_by=UserFactory())

    services.cancel_unpaid_invoice_of(invoice, reason="Visit cancelled")
    services.cancel_unpaid_invoice_of(None, reason="No invoice at all")  # no error

    invoice.refresh_from_db()
    assert invoice.status == Invoice.Status.PAID
