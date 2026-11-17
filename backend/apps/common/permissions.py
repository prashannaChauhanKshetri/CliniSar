"""Role checks used by the views: one permission class per role, plus combinations.

These answer "may this ROLE use this endpoint at all?". Which ROWS a user sees is a
separate question, answered by get_queryset() in each viewset.
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import User

Role = User.Role


class RolePermission(BasePermission):
    """Allows a logged-in user whose role is listed in `allowed_roles`."""

    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)


class IsClinicAdmin(RolePermission):
    """Only the clinic's administrator."""

    allowed_roles = (Role.CLINIC_ADMIN,)


class IsStaff(RolePermission):
    """Only front-desk staff (the STAFF role, not Django's is_staff flag)."""

    allowed_roles = (Role.STAFF,)


class IsDoctor(RolePermission):
    """Only doctors."""

    allowed_roles = (Role.DOCTOR,)


class IsPharmacist(RolePermission):
    """Only pharmacists."""

    allowed_roles = (Role.PHARMACIST,)


class IsLabTechnician(RolePermission):
    """Only lab technicians."""

    allowed_roles = (Role.LAB_TECHNICIAN,)


class IsAdminOrStaff(RolePermission):
    """The clinic admin can do everything front-desk staff can do."""

    allowed_roles = (Role.CLINIC_ADMIN, Role.STAFF)
