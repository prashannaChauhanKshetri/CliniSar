"""Permission rules that only the scheduling app needs."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import User

Role = User.Role


class CanManageSchedule(BasePermission):
    """Reading: admin, staff and doctors. Changing: the clinic admin or that doctor themself."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return user.role in (Role.CLINIC_ADMIN, Role.STAFF, Role.DOCTOR)
        if user.role == Role.CLINIC_ADMIN:
            return True
        is_own_schedule = str(getattr(user, "doctor_profile", None) and user.doctor_profile.id)
        return user.role == Role.DOCTOR and is_own_schedule == str(view.kwargs["doctor_pk"])
