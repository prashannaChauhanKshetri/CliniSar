"""Test factory for audit log entries."""

import uuid

import factory

from apps.accounts.tests.factories import UserFactory
from apps.clinics.tests.factories import ClinicFactory
from apps.common.models import AuditLog


class AuditLogFactory(factory.django.DjangoModelFactory):
    """A CREATE entry written by a user of the same clinic."""

    class Meta:
        model = AuditLog

    clinic = factory.SubFactory(ClinicFactory)
    user = factory.SubFactory(UserFactory, clinic=factory.SelfAttribute("..clinic"))
    action = AuditLog.Action.CREATE
    model_name = "Appointment"
    object_id = factory.LazyFunction(uuid.uuid4)
