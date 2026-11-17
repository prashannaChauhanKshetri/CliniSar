"""Endpoints for the clinic's own settings and its departments."""

from rest_framework import generics

from apps.common.permissions import IsClinicAdmin, ReadOnly
from apps.common.views import TenantViewSet

from .models import Department
from .serializers import ClinicSerializer, DepartmentSerializer


class ClinicView(generics.RetrieveUpdateAPIView):
    """GET, PATCH clinic/: the requester's own clinic.

    Everyone may read it (print pages need the clinic's name and PAN); only the
    clinic admin may change it.
    """

    serializer_class = ClinicSerializer
    permission_classes = [IsClinicAdmin | ReadOnly]
    http_method_names = ["get", "patch"]

    def get_object(self):
        """There is no id in the URL, so no other clinic can ever be reached."""
        return self.request.user.clinic


class DepartmentViewSet(TenantViewSet):
    """CRUD departments/: everyone may list them; only the clinic admin may change them."""

    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsClinicAdmin | ReadOnly]
    search_fields = ["name"]
