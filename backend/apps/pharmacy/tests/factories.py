"""Test factories for medicines, batches and stock movements."""

import datetime
from decimal import Decimal

import factory
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tests.factories import UserFactory
from apps.clinics.tests.factories import ClinicFactory
from apps.pharmacy.models import Medicine, MedicineBatch, StockMovement


class MedicineFactory(factory.django.DjangoModelFactory):
    """A medicine with a unique name."""

    class Meta:
        model = Medicine

    clinic = factory.SubFactory(ClinicFactory)
    name = factory.Sequence(lambda n: f"Medicine {n}")
    generic_name = "Paracetamol"
    strength = "500mg"
    form = "Tablet"
    unit_price = Decimal("10.00")
    reorder_level = 10


class MedicineBatchFactory(factory.django.DjangoModelFactory):
    """A batch of 100 units that expires a year from now."""

    class Meta:
        model = MedicineBatch

    clinic = factory.SubFactory(ClinicFactory)
    medicine = factory.SubFactory(MedicineFactory, clinic=factory.SelfAttribute("..clinic"))
    batch_number = factory.Sequence(lambda n: f"B{n:04d}")
    expiry_date = factory.LazyFunction(lambda: timezone.localdate() + datetime.timedelta(days=365))
    quantity = 100


class StockMovementFactory(factory.django.DjangoModelFactory):
    """A PURCHASE movement of +100 on a batch."""

    class Meta:
        model = StockMovement

    clinic = factory.SubFactory(ClinicFactory)
    batch = factory.SubFactory(MedicineBatchFactory, clinic=factory.SelfAttribute("..clinic"))
    change = 100
    reason = StockMovement.Reason.PURCHASE
    created_by = factory.SubFactory(
        UserFactory, role=User.Role.PHARMACIST, clinic=factory.SelfAttribute("..clinic")
    )
