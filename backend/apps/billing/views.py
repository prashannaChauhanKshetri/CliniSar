"""Invoice endpoints. Invoices are created by other events, so there is no POST invoices/."""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.common.permissions import IsAdminOrStaff, IsLabTechnician, IsPharmacist
from apps.common.views import TenantViewSet

from . import services
from .filters import InvoiceFilter
from .models import Invoice
from .serializers import CancelInvoiceSerializer, InvoiceSerializer, PayInvoiceSerializer

Role = User.Role

# Row-level rule: which invoices each role may see. Admin and staff see all.
SOURCE_FOR_ROLE = {
    Role.PHARMACIST: Invoice.Source.PHARMACY,
    Role.LAB_TECHNICIAN: Invoice.Source.LAB,
}


class InvoiceViewSet(TenantViewSet):
    """invoices/: list, retrieve with lines, plus pay/ and cancel/."""

    queryset = Invoice.objects.select_related("patient", "received_by").prefetch_related("items")
    serializer_class = InvoiceSerializer
    filterset_class = InvoiceFilter
    search_fields = ["patient__first_name", "patient__last_name", "patient__phone"]
    http_method_names = ["get", "post"]

    def get_permissions(self):
        """Only admin and staff cancel; pharmacists and lab technicians view and take payment."""
        if self.action == "cancel":
            return [IsAdminOrStaff()]
        return [(IsAdminOrStaff | IsPharmacist | IsLabTechnician)()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.role in SOURCE_FOR_ROLE:
            queryset = queryset.filter(source=SOURCE_FOR_ROLE[user.role])
        return queryset

    def create(self, request, *args, **kwargs):
        """Invoices are never typed by hand."""
        return self.http_method_not_allowed(request, *args, **kwargs)

    @extend_schema(request=PayInvoiceSerializer, responses=InvoiceSerializer)
    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None) -> Response:
        invoice = self.get_object()  # first, so another clinic's id is a 404
        serializer = PayInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.pay_invoice(
            invoice, received_by=request.user, **serializer.validated_data
        )
        return Response(InvoiceSerializer(invoice).data)

    @extend_schema(request=CancelInvoiceSerializer, responses=InvoiceSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None) -> Response:
        invoice = self.get_object()
        serializer = CancelInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.cancel_invoice(invoice, reason=serializer.validated_data["reason"])
        return Response(InvoiceSerializer(invoice).data)
