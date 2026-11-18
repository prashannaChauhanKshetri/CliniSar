"""Test factories for invoices and their lines."""

from decimal import Decimal

import factory

from apps.billing.models import Invoice, InvoiceItem
from apps.clinics.tests.factories import ClinicFactory
from apps.scheduling.tests.factories import AppointmentFactory


class InvoiceFactory(factory.django.DjangoModelFactory):
    """An UNPAID consultation invoice of Rs. 500 without VAT, for an appointment."""

    class Meta:
        model = Invoice

    clinic = factory.SubFactory(ClinicFactory)
    number = factory.Sequence(lambda n: n + 1)
    issuer_name = factory.SelfAttribute("clinic.name")
    appointment = factory.SubFactory(AppointmentFactory, clinic=factory.SelfAttribute("..clinic"))
    patient = factory.SelfAttribute("appointment.patient")
    source = Invoice.Source.CONSULTATION
    subtotal = Decimal("500.00")
    discount = Decimal("0.00")
    vat_rate = Decimal("0.00")
    vat_amount = Decimal("0.00")
    total = Decimal("500.00")


class InvoiceItemFactory(factory.django.DjangoModelFactory):
    """One invoice line of Rs. 500."""

    class Meta:
        model = InvoiceItem

    invoice = factory.SubFactory(InvoiceFactory)
    description = "Consultation fee"
    quantity = 1
    unit_price = Decimal("500.00")
    line_total = Decimal("500.00")
