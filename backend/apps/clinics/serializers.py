"""Serializers for the clinic's own settings and its departments."""

from rest_framework import serializers

from .models import Clinic, Department


class ClinicSerializer(serializers.ModelSerializer):
    """The clinic's details, print settings and VAT settings."""

    class Meta:
        model = Clinic
        fields = [
            "id",
            "name",
            "name_nepali",
            "slug",
            "phone",
            "address",
            "address_nepali",
            "pan_number",
            "prescription_note",
            "receipt_width_mm",
            "vat_rate",
            "vat_on_consultation",
            "vat_on_pharmacy",
            "vat_on_lab",
        ]
        # The slug is the clinic's permanent identifier, set by the super admin.
        read_only_fields = ["id", "slug"]


class DepartmentSerializer(serializers.ModelSerializer):
    """A department. There is no clinic field: the clinic comes from the logged-in user."""

    class Meta:
        model = Department
        fields = ["id", "name"]

    def validate_name(self, value: str) -> str:
        """Give a clear 400 for a duplicate name instead of a database error."""
        clinic = self.context["request"].user.clinic
        same_name = Department.objects.filter(clinic=clinic, name__iexact=value)
        if self.instance:
            same_name = same_name.exclude(pk=self.instance.pk)
        if same_name.exists():
            raise serializers.ValidationError("A department with this name already exists.")
        return value
