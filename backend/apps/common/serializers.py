"""Serializer helpers shared by every app."""

from rest_framework import serializers


class TenantPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """A link to another object that only accepts objects of the requester's clinic.

    If the client sends the id of another clinic's object, validation fails with the
    same "does not exist" error as for a made-up id.
    """

    def __init__(self, tenant_field: str = "clinic", **kwargs) -> None:
        self.tenant_field = tenant_field
        super().__init__(**kwargs)

    def get_queryset(self):
        clinic = self.context["request"].user.clinic
        return super().get_queryset().filter(**{self.tenant_field: clinic})
