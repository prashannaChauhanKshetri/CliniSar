"""Authentication endpoints and the staff, doctor and patient endpoints.

The rules live in services.py; these views stay thin.
"""

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import (
    IsAdminOrStaff,
    IsClinicAdmin,
    IsDoctor,
    IsLabTechnician,
    ReadOnly,
)
from apps.common.views import TenantViewSet

from . import services
from .cookies import clear_refresh_cookie, set_refresh_cookie
from .models import DoctorProfile, PatientProfile, User
from .serializers import (
    AccessTokenSerializer,
    ChangePasswordSerializer,
    DoctorSerializer,
    LoginResponseSerializer,
    LoginSerializer,
    PatientSerializer,
    StaffSerializer,
    UserSerializer,
)
from .throttles import LoginRateThrottle


class LoginView(APIView):
    """POST auth/login/: check email and password, start a session."""

    # No token is needed (or looked at) to log in.
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    @extend_schema(request=LoginSerializer, responses=LoginResponseSerializer)
    def post(self, request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.authenticate_user(**serializer.validated_data)
        access, refresh = services.issue_tokens(user)

        # The access token goes in the body; the refresh token only in the cookie.
        response = Response({"access": access, "user": UserSerializer(user).data})
        set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    """POST auth/refresh/: use the refresh cookie to get a new access token."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses=AccessTokenSerializer)
    def post(self, request) -> Response:
        old_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        try:
            access, new_refresh = services.rotate_tokens(old_refresh)
        except services.SessionError as error:
            # Also remove the useless cookie, so the browser stops sending it.
            response = Response({"detail": error.detail}, status=error.status_code)
            clear_refresh_cookie(response)
            return response

        response = Response({"access": access})
        set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(APIView):
    """POST auth/logout/: blacklist the refresh token and remove the cookie."""

    # Works even when the access token has already expired.
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request) -> Response:
        services.revoke_refresh_token(request.COOKIES.get(settings.REFRESH_COOKIE_NAME))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class ChangePasswordView(APIView):
    """POST auth/change-password/: set a new password after confirming the current one."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """GET, PATCH auth/me/: read or edit the logged-in user's own details."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch"]

    def get_object(self):
        """Always the requester: there is no id in the URL to tamper with."""
        return self.request.user


class StaffViewSet(TenantViewSet):
    """CRUD staff/: the clinic admin manages front-desk staff, pharmacists and lab technicians."""

    queryset = User.objects.filter(role__in=StaffSerializer.STAFF_ROLES)
    serializer_class = StaffSerializer
    permission_classes = [IsClinicAdmin]
    filterset_fields = ["role", "is_active"]
    search_fields = ["first_name", "last_name", "email"]

    def perform_destroy(self, instance: User) -> None:
        """DELETE deactivates the login instead of removing the row."""
        services.deactivate_user(instance)


class DoctorViewSet(TenantViewSet):
    """CRUD doctors/: everyone may list doctors; only the clinic admin may change them."""

    queryset = DoctorProfile.objects.select_related("user", "department")
    serializer_class = DoctorSerializer
    permission_classes = [IsClinicAdmin | ReadOnly]
    # A DoctorProfile has no clinic column of its own; its clinic is its user's clinic.
    tenant_field = "user__clinic"
    filterset_fields = ["department"]
    search_fields = ["user__first_name", "user__last_name", "specialization"]

    def perform_create(self, serializer) -> None:
        """The serializer sets the clinic on the new User, so nothing is passed here."""
        serializer.save()

    def perform_destroy(self, instance: DoctorProfile) -> None:
        """DELETE deactivates the doctor's login instead of removing the row."""
        services.deactivate_user(instance.user)


class PatientViewSet(TenantViewSet):
    """CRUD patients/.

    Admin and staff manage patients. A doctor reads their own patients. A lab technician
    may search and register patients (for people who come straight to the lab); those
    are flagged needs_review until the front desk checks them (mark-checked/).
    """

    queryset = PatientProfile.objects.select_related("registered_by")
    serializer_class = PatientSerializer
    # first_name__iexact + last_name__iexact: "is someone with this name already here?"
    filterset_fields = {
        "needs_review": ["exact"],
        "first_name": ["iexact"],
        "last_name": ["iexact"],
    }
    search_fields = ["first_name", "last_name", "phone"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [(IsAdminOrStaff | IsLabTechnician | IsDoctor)()]
        if self.action == "create":
            return [(IsAdminOrStaff | IsLabTechnician)()]
        return [IsAdminOrStaff()]  # edit, delete, mark-checked

    def perform_create(self, serializer) -> None:
        """Record who registered the patient; the lab's registrations need checking."""
        user = self.request.user
        services.save_patient(
            serializer,
            clinic=user.clinic,
            registered_by=user,
            needs_review=user.role == User.Role.LAB_TECHNICIAN,
        )

    def perform_update(self, serializer) -> None:
        services.save_patient(serializer)

    @extend_schema(request=None, responses=PatientSerializer)
    @action(detail=True, methods=["post"], url_path="mark-checked")
    def mark_checked(self, request, pk=None) -> Response:
        """The front desk confirms the details of a patient registered at the lab."""
        patient = services.mark_patient_checked(self.get_object())
        return Response(PatientSerializer(patient, context=self.get_serializer_context()).data)

    def get_queryset(self):
        """Row-level rule: a doctor only sees patients who have an appointment with them."""
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role == User.Role.DOCTOR:
            queryset = queryset.filter(appointments__doctor__user=user).distinct()
        return queryset
