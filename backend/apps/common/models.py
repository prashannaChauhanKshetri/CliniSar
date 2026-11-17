"""Building blocks shared by every app: base models, the money field and the audit log."""

import uuid

from django.conf import settings
from django.db import models


def money_field(**options) -> models.DecimalField:
    """Return the one DecimalField shape used for every rupee amount (never a float)."""
    return models.DecimalField(max_digits=10, decimal_places=2, **options)


class BaseModel(models.Model):
    """Gives every table a UUID primary key and created/updated timestamps."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantModel(BaseModel):
    """Base for every clinic-owned table: adds the clinic column used for tenant isolation."""

    # A ForeignKey is indexed automatically, which keeps "rows of my clinic" queries fast.
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT)

    class Meta:
        abstract = True


class AuditLog(TenantModel):
    """Records who created, updated or deleted an important record, for accountability."""

    class Action(models.TextChoices):
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="audit_logs"
    )
    action = models.CharField(max_length=10, choices=Action.choices)
    model_name = models.CharField(max_length=100)
    object_id = models.UUIDField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} {self.model_name} {self.object_id}"
