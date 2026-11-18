"""Serializers for prescriptions."""

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import PatientProfile
from apps.common.serializers import TenantPrimaryKeyRelatedField
from apps.common.validators import validate_upload
from apps.pharmacy.models import Medicine
from apps.scheduling.models import Appointment

from .models import Document, Prescription, PrescriptionItem


class PrescriptionItemSerializer(serializers.ModelSerializer):
    """One medicine line. The medicine must belong to the requester's clinic."""

    medicine = TenantPrimaryKeyRelatedField(queryset=Medicine.objects.all())
    medicine_name = serializers.CharField(source="medicine.__str__", read_only=True)
    medicine_form = serializers.CharField(source="medicine.form", read_only=True)

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "medicine",
            "medicine_name",
            "medicine_form",
            "dosage",
            "frequency",
            "duration_days",
            "quantity",
            "instructions",
        ]
        extra_kwargs = {"quantity": {"min_value": 1}, "duration_days": {"min_value": 1}}


class PrescriptionSerializer(serializers.ModelSerializer):
    """A prescription with everything its printed page needs (read only)."""

    items = PrescriptionItemSerializer(many=True, read_only=True)
    visit_date = serializers.DateField(source="appointment.date", read_only=True)
    patient = serializers.UUIDField(source="appointment.patient_id", read_only=True)
    patient_name = serializers.CharField(source="appointment.patient.full_name", read_only=True)
    patient_gender = serializers.CharField(source="appointment.patient.gender", read_only=True)
    patient_address = serializers.CharField(source="appointment.patient.address", read_only=True)
    patient_age = serializers.SerializerMethodField()
    doctor = serializers.UUIDField(source="appointment.doctor_id", read_only=True)
    doctor_name = serializers.CharField(
        source="appointment.doctor.user.get_full_name", read_only=True
    )
    dispensed_by_name = serializers.CharField(
        source="dispensed_by.get_full_name", read_only=True, allow_null=True
    )

    class Meta:
        model = Prescription
        fields = [
            "id",
            "appointment",
            "visit_date",
            "patient",
            "patient_name",
            "patient_age",
            "patient_gender",
            "patient_address",
            "doctor",
            "doctor_name",
            "diagnosis",
            "notes",
            "status",
            "items",
            "dispensed_by",
            "dispensed_by_name",
            "dispensed_at",
            "created_at",
        ]
        read_only_fields = fields

    def get_patient_age(self, prescription: Prescription) -> int | None:
        return prescription.appointment.patient.age_on(timezone.localdate())


class PrescriptionCreateSerializer(serializers.Serializer):
    """Input of POST prescriptions/: the visit, diagnosis and at least one medicine."""

    appointment = TenantPrimaryKeyRelatedField(
        queryset=Appointment.objects.select_related("doctor")
    )
    diagnosis = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = PrescriptionItemSerializer(many=True)

    def validate_items(self, items: list[dict]) -> list[dict]:
        if not items:
            raise serializers.ValidationError("Add at least one medicine.")
        medicines = [item["medicine"].pk for item in items]
        if len(medicines) != len(set(medicines)):
            raise serializers.ValidationError("Each medicine may appear only once.")
        return items


class DocumentSerializer(serializers.ModelSerializer):
    """A file kept for a patient (old report, scan, ...): PDF, JPG or PNG up to 10 MB."""

    patient = TenantPrimaryKeyRelatedField(queryset=PatientProfile.objects.all())
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    file = serializers.FileField(validators=[validate_upload])
    uploaded_by_name = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "patient",
            "patient_name",
            "title",
            "file",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
        ]
        read_only_fields = ["uploaded_by"]

    def create(self, validated_data: dict) -> Document:
        """The uploader is always the logged-in user."""
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)
