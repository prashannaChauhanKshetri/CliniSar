"""Serializers for lab tests (with parameters) and lab orders (with results)."""

import json

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import PatientProfile
from apps.common.serializers import TenantPrimaryKeyRelatedField
from apps.common.validators import validate_upload
from apps.scheduling.models import Appointment

from .models import LabOrder, LabOrderItem, LabResult, LabTest, LabTestParameter


class LabTestParameterSerializer(serializers.ModelSerializer):
    """One report row of a test. Send the id to keep (and edit) an existing row."""

    id = serializers.UUIDField(required=False)

    class Meta:
        model = LabTestParameter
        fields = ["id", "name", "unit", "reference_range", "section", "position"]
        read_only_fields = ["position"]  # the order in the list decides the position


class LabTestSerializer(serializers.ModelSerializer):
    """A lab test with its report rows. Saving replaces the rows with the list sent."""

    parameters = LabTestParameterSerializer(many=True)

    class Meta:
        model = LabTest
        fields = [
            "id",
            "name",
            "price",
            "category",
            "method",
            "specimen",
            "interpretation",
            "is_active",
            "parameters",
        ]
        extra_kwargs = {"price": {"min_value": 0}}
        validators = []  # the unique name check is in validate_name with a clear message

    def validate_name(self, value: str) -> str:
        clinic = self.context["request"].user.clinic
        same = LabTest.objects.filter(clinic=clinic, name__iexact=value)
        if self.instance:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError("A lab test with this name already exists.")
        return value

    def validate_parameters(self, rows: list[dict]) -> list[dict]:
        if not rows:
            raise serializers.ValidationError("A test needs at least one result row.")
        return rows

    def create(self, validated_data: dict) -> LabTest:
        from . import services  # noqa: PLC0415 (avoids a circular import at load time)

        rows = validated_data.pop("parameters")
        lab_test = LabTest.objects.create(**validated_data)
        services.save_parameters(lab_test, rows)
        return lab_test

    def update(self, instance: LabTest, validated_data: dict) -> LabTest:
        from . import services  # noqa: PLC0415

        rows = validated_data.pop("parameters", None)
        instance = super().update(instance, validated_data)
        if rows is not None:
            services.save_parameters(instance, rows)
        return instance


class LabResultSerializer(serializers.ModelSerializer):
    """One printed result row (a copy, so it never changes)."""

    class Meta:
        model = LabResult
        fields = ["id", "name", "unit", "reference_range", "section", "value", "flag"]
        read_only_fields = fields


class LabOrderItemSerializer(serializers.ModelSerializer):
    """One test of an order: its details, the rows to fill in, and the entered results."""

    lab_test_name = serializers.CharField(source="lab_test.name", read_only=True)
    category = serializers.CharField(source="lab_test.category", read_only=True)
    method = serializers.CharField(source="lab_test.method", read_only=True)
    specimen = serializers.CharField(source="lab_test.specimen", read_only=True)
    interpretation = serializers.CharField(source="lab_test.interpretation", read_only=True)
    # The current rows, used by the result-entry form while the order is not completed.
    parameters = LabTestParameterSerializer(source="lab_test.parameters", many=True, read_only=True)
    results = LabResultSerializer(many=True, read_only=True)

    class Meta:
        model = LabOrderItem
        fields = [
            "id",
            "lab_test",
            "lab_test_name",
            "category",
            "method",
            "specimen",
            "interpretation",
            "parameters",
            "results",
        ]
        read_only_fields = fields


class LabOrderSerializer(serializers.ModelSerializer):
    """A lab order with everything the printed report needs (read only)."""

    items = LabOrderItemSerializer(many=True, read_only=True)
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    patient_address = serializers.CharField(source="patient.address", read_only=True)
    patient_phone = serializers.CharField(source="patient.phone", read_only=True)
    patient_age = serializers.SerializerMethodField()
    consultant = serializers.SerializerMethodField()
    ordered_by_name = serializers.CharField(source="ordered_by.get_full_name", read_only=True)
    completed_by_name = serializers.CharField(
        source="completed_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = LabOrder
        fields = [
            "id",
            "lab_number",
            "status",
            "patient",
            "patient_name",
            "patient_age",
            "patient_gender",
            "patient_address",
            "patient_phone",
            "appointment",
            "consultant",
            "items",
            "ordered_by",
            "ordered_by_name",
            "collected_at",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "file",
            "cancel_reason",
            "created_at",
        ]
        read_only_fields = fields

    def get_patient_age(self, order: LabOrder) -> int | None:
        return order.patient.age_on(timezone.localdate())

    def get_consultant(self, order: LabOrder) -> str:
        """The referring doctor as printed on the report, or "Self" without a visit."""
        if order.appointment is None:
            return "Self"
        return f"Dr. {order.appointment.doctor.user.get_full_name()}"


class LabOrderCreateSerializer(serializers.Serializer):
    """Input of POST lab-orders/: tests plus a visit (doctor) or a patient (self-referred)."""

    appointment = TenantPrimaryKeyRelatedField(
        queryset=Appointment.objects.select_related("doctor"), required=False, allow_null=True
    )
    patient = TenantPrimaryKeyRelatedField(
        queryset=PatientProfile.objects.all(), required=False, allow_null=True
    )
    tests = TenantPrimaryKeyRelatedField(queryset=LabTest.objects.all(), many=True)


class ResultInputSerializer(serializers.Serializer):
    """One submitted result: which parameter, the value, and normal or abnormal."""

    parameter = serializers.UUIDField()
    value = serializers.CharField(max_length=200)
    flag = serializers.ChoiceField(choices=LabResult.Flag.choices)


class CompleteLabOrderSerializer(serializers.Serializer):
    """Input of POST lab-orders/<id>/complete/.

    Sent as JSON, or as multipart form data when a file is attached; then `results`
    arrives as a JSON text and is decoded here.
    """

    results = serializers.JSONField()
    file = serializers.FileField(required=False, validators=[validate_upload])

    def validate_results(self, value) -> list[dict]:
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError as error:
                raise serializers.ValidationError("Results must be a JSON list.") from error
        rows = ResultInputSerializer(data=value, many=True)
        rows.is_valid(raise_exception=True)
        return rows.validated_data


class CancelLabOrderSerializer(serializers.Serializer):
    """Input of POST lab-orders/<id>/cancel/."""

    reason = serializers.CharField()
