"""Endpoints for lab tests and lab orders. Rules live in services.py."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.common.audit import Action, AuditLogMixin
from apps.common.permissions import (
    IsAdminOrStaff,
    IsClinicAdmin,
    IsDoctor,
    IsLabTechnician,
    ReadOnly,
)
from apps.common.views import TenantViewSet

from . import services
from .models import LabOrder, LabTest
from .serializers import (
    CancelLabOrderSerializer,
    CompleteLabOrderSerializer,
    LabOrderCreateSerializer,
    LabOrderSerializer,
    LabTestSerializer,
)


class LabTestViewSet(TenantViewSet):
    """CRUD lab-tests/: admin and lab technician manage; staff and doctors read."""

    queryset = LabTest.objects.prefetch_related("parameters")
    serializer_class = LabTestSerializer
    filterset_fields = ["category", "is_active"]
    search_fields = ["name"]

    def get_permissions(self):
        readers = (IsAdminOrStaff | IsDoctor) & ReadOnly
        return [(IsClinicAdmin | IsLabTechnician | readers)()]


class LabOrderViewSet(AuditLogMixin, TenantViewSet):
    """lab-orders/: list, create, retrieve, plus collect/, complete/ and cancel/."""

    queryset = LabOrder.objects.select_related(
        "patient", "appointment__doctor__user", "ordered_by", "completed_by"
    ).prefetch_related("items__lab_test__parameters", "items__results")
    serializer_class = LabOrderSerializer
    filterset_fields = ["status", "patient", "appointment", "lab_number"]
    search_fields = ["patient__first_name", "patient__last_name", "patient__phone"]
    http_method_names = ["get", "post"]

    def get_permissions(self):
        if self.action == "create":
            return [(IsDoctor | IsLabTechnician)()]
        if self.action in ("collect", "complete", "cancel"):
            return [IsLabTechnician()]
        return [(IsAdminOrStaff | IsDoctor | IsLabTechnician)()]

    def get_queryset(self):
        """Row-level rule: a doctor sees the lab orders of their own patients."""
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role == User.Role.DOCTOR:
            own_patients = user.doctor_profile.appointments.values("patient")
            queryset = queryset.filter(patient__in=own_patients)
        return queryset

    def respond(self, order: LabOrder, code: int = status.HTTP_200_OK) -> Response:
        """Reload with all related rows and return the full order."""
        order = self.get_queryset().get(pk=order.pk)
        return Response(
            LabOrderSerializer(order, context=self.get_serializer_context()).data, status=code
        )

    @extend_schema(request=LabOrderCreateSerializer, responses={201: LabOrderSerializer})
    def create(self, request) -> Response:
        serializer = LabOrderCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = services.create_lab_order(
            clinic=request.user.clinic,
            tests=data["tests"],
            ordered_by=request.user,
            patient=data.get("patient"),
            appointment=data.get("appointment"),
        )
        self.audit(Action.CREATE, order)
        return self.respond(order, status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=LabOrderSerializer)
    @action(detail=True, methods=["post"])
    def collect(self, request, pk=None) -> Response:
        order = services.collect_sample(self.get_object(), user=request.user)
        self.audit(Action.UPDATE, order)
        return self.respond(order)

    @extend_schema(request=CompleteLabOrderSerializer, responses=LabOrderSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None) -> Response:
        order = self.get_object()
        serializer = CompleteLabOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.complete_lab_order(order, user=request.user, **serializer.validated_data)
        self.audit(Action.UPDATE, order)
        return self.respond(order)

    @extend_schema(request=CancelLabOrderSerializer, responses=LabOrderSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None) -> Response:
        order = self.get_object()
        serializer = CancelLabOrderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.cancel_lab_order(order, reason=serializer.validated_data["reason"])
        self.audit(Action.UPDATE, order)
        return self.respond(order)
