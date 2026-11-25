"""Role checks used by the views: one permission class per role, plus combinations.

These answer "may this ROLE use this endpoint at all?". Which ROWS a user sees is a
separate question, answered by get_queryset() in each viewset.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

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
    """Front desk & pharmacy (the STAFF role, not Django's is_staff flag).

    EN: Since phase 12 this one role also does the pharmacist's work (dispensing, stock).
    NP: Yo role le reception ra pharmacy dubai kaam garcha. "is_staff" (Django admin ko
        flag) sanga confuse nagarnu hai, tyo arkai kura ho.
    """

    allowed_roles = (Role.STAFF,)


class IsDoctor(RolePermission):
    """Only doctors."""

    allowed_roles = (Role.DOCTOR,)


class IsLabTechnician(RolePermission):
    """Only lab technicians."""

    allowed_roles = (Role.LAB_TECHNICIAN,)


class IsAdminOrStaff(RolePermission):
    """The clinic admin can do everything front-desk staff can do."""

    allowed_roles = (Role.CLINIC_ADMIN, Role.STAFF)


class ReadOnly(BasePermission):
    """Any logged-in user, but only for reading (GET). Combine it with a role class,
    e.g. `IsClinicAdmin | ReadOnly` = everyone may look, only the admin may change.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and request.method in SAFE_METHODS)
