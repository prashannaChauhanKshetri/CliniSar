"""Prescription endpoints. Rules live in records/services.py and pharmacy/services.py."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.common.audit import Action, AuditLogMixin
from apps.common.permissions import IsAdminOrStaff, IsDoctor, IsPharmacist, IsStaff, ReadOnly
from apps.common.views import TenantViewSet
from apps.pharmacy import services as pharmacy

from . import services
from .models import Document, Prescription
from .serializers import DocumentSerializer, PrescriptionCreateSerializer, PrescriptionSerializer


def only_own_patients(queryset, user, patient_field: str):
    """Row-level rule shared by prescriptions and documents: a doctor sees the records of
    patients who have (had) a visit with them; other roles are not narrowed here."""
    if user.is_authenticated and user.role == User.Role.DOCTOR:
        own_patients = user.doctor_profile.appointments.values("patient")
        queryset = queryset.filter(**{f"{patient_field}__in": own_patients})
    return queryset


class PrescriptionViewSet(AuditLogMixin, TenantViewSet):
    """prescriptions/: list, create (doctor), retrieve, and dispense/ (pharmacist, front desk)."""

    queryset = Prescription.objects.select_related(
        "appointment__patient", "appointment__doctor__user", "dispensed_by"
    ).prefetch_related("items__medicine")
    serializer_class = PrescriptionSerializer
    filterset_fields = ["status", "appointment", "appointment__patient"]
    search_fields = ["appointment__patient__first_name", "appointment__patient__last_name"]
    http_method_names = ["get", "post"]

    def get_permissions(self):
        if self.action == "create":
            return [IsDoctor()]
        if self.action == "dispense":
            return [(IsPharmacist | IsStaff)()]  # the front desk may dispense too
        return [(IsAdminOrStaff | IsDoctor | IsPharmacist)()]

    def get_queryset(self):
        """Row-level rule: a doctor sees the prescriptions of their own patients."""
        return only_own_patients(super().get_queryset(), self.request.user, "appointment__patient")

    @extend_schema(request=PrescriptionCreateSerializer, responses={201: PrescriptionSerializer})
    def create(self, request) -> Response:
        serializer = PrescriptionCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        prescription = services.create_prescription(
            appointment=data["appointment"],
            doctor_user=request.user,
            diagnosis=data["diagnosis"],
            notes=data["notes"],
            items=data["items"],
        )
        self.audit(Action.CREATE, prescription)
        prescription = self.get_queryset().get(pk=prescription.pk)
        return Response(PrescriptionSerializer(prescription).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=PrescriptionSerializer)
    @action(detail=True, methods=["post"])
    def dispense(self, request, pk=None) -> Response:
        prescription = pharmacy.dispense_prescription(self.get_object(), user=request.user)
        self.audit(Action.UPDATE, prescription)
        prescription = self.get_queryset().get(pk=prescription.pk)
        return Response(PrescriptionSerializer(prescription).data)


class DocumentViewSet(AuditLogMixin, TenantViewSet):
    """documents/: list, upload (multipart: patient, title, file), view, delete.

    Admin and staff upload and delete; doctors read the documents of their own patients.
    """

    queryset = Document.objects.select_related("patient", "uploaded_by")
    serializer_class = DocumentSerializer
    filterset_fields = ["patient"]
    search_fields = ["title", "patient__first_name", "patient__last_name"]
    http_method_names = ["get", "post", "delete"]

    def get_permissions(self):
        return [(IsAdminOrStaff | (IsDoctor & ReadOnly))()]

    def get_queryset(self):
        return only_own_patients(super().get_queryset(), self.request.user, "patient")
