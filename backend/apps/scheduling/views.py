"""Endpoints for doctor schedules, free slots and appointments. Rules live in services.py."""

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import DoctorProfile, User
from apps.common.audit import Action, AuditLogMixin
from apps.common.permissions import IsAdminOrStaff, IsDoctor
from apps.common.views import TenantViewSet

from . import services
from .filters import AppointmentFilter
from .models import Appointment, DoctorSchedule
from .permissions import CanManageSchedule
from .serializers import (
    AppointmentCreateSerializer,
    AppointmentSerializer,
    CancelAppointmentSerializer,
    DoctorScheduleSerializer,
    SlotSerializer,
)


def get_clinic_doctor(request, doctor_pk) -> DoctorProfile:
    """The doctor from the URL, but only if they work in the requester's clinic (else 404)."""
    doctors = DoctorProfile.objects.select_related("user")
    return get_object_or_404(doctors, pk=doctor_pk, user__clinic=request.user.clinic)


class DoctorScheduleViewSet(TenantViewSet):
    """CRUD doctors/<doctor_pk>/schedules/: one doctor's weekly working hours."""

    queryset = DoctorSchedule.objects.all()
    serializer_class = DoctorScheduleSerializer
    permission_classes = [CanManageSchedule]
    pagination_class = None  # a doctor has only a handful of blocks

    def get_doctor(self) -> DoctorProfile:
        return get_clinic_doctor(self.request, self.kwargs["doctor_pk"])

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, "swagger_fake_view", False):
            return queryset
        return queryset.filter(doctor=self.get_doctor())

    def get_serializer_context(self) -> dict:
        """The serializer needs the doctor to check for overlapping hours."""
        context = super().get_serializer_context()
        if not getattr(self, "swagger_fake_view", False):
            context["doctor"] = self.get_doctor()
        return context

    def perform_create(self, serializer) -> None:
        serializer.save(clinic=self.request.user.clinic, doctor=self.get_doctor())


class SlotsView(APIView):
    """GET doctors/<doctor_pk>/slots/?date=YYYY-MM-DD: free slots of a doctor on a day."""

    permission_classes = [IsAdminOrStaff | IsDoctor]

    @extend_schema(
        parameters=[OpenApiParameter("date", str, required=True, description="YYYY-MM-DD")],
        responses=SlotSerializer(many=True),
    )
    def get(self, request, doctor_pk) -> Response:
        doctor = get_clinic_doctor(request, doctor_pk)
        day = serializers.DateField().run_validation(request.query_params.get("date"))
        slots = services.free_slots(doctor, day)
        return Response(SlotSerializer(slots, many=True).data)


class AppointmentViewSet(AuditLogMixin, TenantViewSet):
    """appointments/: list, create, retrieve, plus the cancel/ and complete/ actions.

    There is no PATCH or DELETE: a visit only changes through its actions.
    """

    queryset = Appointment.objects.select_related("patient", "doctor__user", "doctor__department")
    serializer_class = AppointmentSerializer
    filterset_class = AppointmentFilter
    search_fields = ["patient__first_name", "patient__last_name", "patient__phone"]
    http_method_names = ["get", "post"]

    def get_permissions(self):
        """Admin and staff create visits; doctors may also view, cancel and complete theirs."""
        if self.action == "create":
            return [IsAdminOrStaff()]
        return [(IsAdminOrStaff | IsDoctor)()]

    def get_queryset(self):
        """Row-level rule: a doctor only sees their own appointments."""
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role == User.Role.DOCTOR:
            queryset = queryset.filter(doctor__user=user)
        return queryset

    @extend_schema(request=AppointmentCreateSerializer, responses={201: AppointmentSerializer})
    def create(self, request) -> Response:
        """Book a time slot or add a walk-in, depending on visit_type."""
        serializer = AppointmentCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        common = {
            "clinic": request.user.clinic,
            "patient": data["patient"],
            "doctor": data["doctor"],
            "reason": data["reason"],
            "booked_by": request.user,
        }
        if data["visit_type"] == Appointment.VisitType.WALK_IN:
            appointment = services.add_walk_in(**common)
        else:
            appointment = services.book_appointment(
                **common, day=data["date"], start_time=data["start_time"]
            )
        self.audit(Action.CREATE, appointment)
        return Response(AppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=CancelAppointmentSerializer, responses=AppointmentSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None) -> Response:
        # Look the object up first, so another clinic's id is a 404 before anything else.
        appointment = self.get_object()
        serializer = CancelAppointmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = services.cancel_appointment(
            appointment, user=request.user, reason=serializer.validated_data["reason"]
        )
        self.audit(Action.UPDATE, appointment)
        return Response(AppointmentSerializer(appointment).data)

    @extend_schema(request=None, responses=AppointmentSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None) -> Response:
        appointment = services.complete_appointment(self.get_object())
        self.audit(Action.UPDATE, appointment)
        return Response(AppointmentSerializer(appointment).data)
