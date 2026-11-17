"""Test factories for prescriptions, their items and documents."""

import factory

from apps.accounts.tests.factories import PatientProfileFactory, UserFactory
from apps.clinics.tests.factories import ClinicFactory
from apps.pharmacy.tests.factories import MedicineFactory
from apps.records.models import Document, Prescription, PrescriptionItem
from apps.scheduling.tests.factories import AppointmentFactory


class PrescriptionFactory(factory.django.DjangoModelFactory):
    """A PENDING prescription for an appointment in the same clinic."""

    class Meta:
        model = Prescription

    clinic = factory.SubFactory(ClinicFactory)
    appointment = factory.SubFactory(AppointmentFactory, clinic=factory.SelfAttribute("..clinic"))
    diagnosis = "Seasonal flu"


class PrescriptionItemFactory(factory.django.DjangoModelFactory):
    """One medicine line; the medicine is in the prescription's clinic."""

    class Meta:
        model = PrescriptionItem

    prescription = factory.SubFactory(PrescriptionFactory)
    medicine = factory.SubFactory(
        MedicineFactory, clinic=factory.SelfAttribute("..prescription.clinic")
    )
    dosage = "1 tablet"
    frequency = "3 times a day"
    duration_days = 5
    quantity = 15


class DocumentFactory(factory.django.DjangoModelFactory):
    """A small uploaded PDF for a patient."""

    class Meta:
        model = Document

    clinic = factory.SubFactory(ClinicFactory)
    patient = factory.SubFactory(PatientProfileFactory, clinic=factory.SelfAttribute("..clinic"))
    title = "Old report"
    file = factory.django.FileField(filename="report.pdf", data=b"%PDF-1.4 test")
    uploaded_by = factory.SubFactory(UserFactory, clinic=factory.SelfAttribute("..clinic"))
