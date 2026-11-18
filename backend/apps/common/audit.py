"""The audit log: who created, changed or deleted an important record, and when."""

from apps.common.models import AuditLog

Action = AuditLog.Action


def record(user, action: str, instance) -> None:
    """Write one audit row for this user, action and object."""
    AuditLog.objects.create(
        clinic=user.clinic,
        user=user,
        action=action,
        model_name=type(instance).__name__,
        object_id=instance.pk,
    )


class AuditLogMixin:
    """Add to a viewset to log its creates, updates and deletes automatically.

    Custom actions (cancel/, pay/, dispense/ ...) call self.audit(Action.UPDATE, obj)
    themselves, because DRF's perform_* hooks only run for the standard actions.
    """

    def audit(self, action: str, instance) -> None:
        record(self.request.user, action, instance)

    def perform_create(self, serializer) -> None:
        super().perform_create(serializer)
        self.audit(Action.CREATE, serializer.instance)

    def perform_update(self, serializer) -> None:
        super().perform_update(serializer)
        self.audit(Action.UPDATE, serializer.instance)

    def perform_destroy(self, instance) -> None:
        self.audit(Action.DELETE, instance)  # before deleting, while the object still exists
        super().perform_destroy(instance)
