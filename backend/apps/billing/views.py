"""Invoice endpoints. Invoices are created by other events, so there is no POST invoices/."""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.common.audit import Action, AuditLogMixin
from apps.common.permissions import IsAdminOrStaff, IsClinicAdmin, IsLabTechnician
from apps.common.views import TenantViewSet

from . import services
from .filters import InvoiceFilter
from .models import Invoice
from .serializers import CancelInvoiceSerializer, InvoiceSerializer, PayInvoiceSerializer

Role = User.Role

# Row-level rule: which invoices each role may see. Admin and front desk & pharmacy
# see all; the lab sees its own bills (unchanged).
SOURCE_FOR_ROLE = {
    Role.LAB_TECHNICIAN: Invoice.Source.LAB,
}


class InvoiceViewSet(AuditLogMixin, TenantViewSet):
    """invoices/: list, retrieve with lines, plus pay/ and cancel/."""

    queryset = Invoice.objects.select_related(
        "patient", "received_by", "cancelled_by"
    ).prefetch_related("items")
    serializer_class = InvoiceSerializer
    filterset_class = InvoiceFilter
    search_fields = ["patient__first_name", "patient__last_name", "patient__phone"]
    http_method_names = ["get", "post"]

    def get_permissions(self):
        """Who may do what with bills (phase 12, the client's money rules).

        EN: Admin and front desk & pharmacy take payment, give discounts and cancel; a
            cancellation by the front desk is flagged for the admin, and only the admin
            marks it reviewed. The lab views and collects its own bills, as before.
        NP: Paisa linu, discount dinu, cancel garnu front desk le pani milcha. Tara
            cancel garepachi admin lai notification jancha, "Seen" admin le matra garcha.
        """
        if self.action == "cancel":
            return [IsAdminOrStaff()]
        if self.action == "mark_reviewed":
            return [IsClinicAdmin()]
        return [(IsAdminOrStaff | IsLabTechnician)()]

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
        self.audit(Action.UPDATE, invoice)
        return Response(InvoiceSerializer(invoice).data)

    @extend_schema(request=CancelInvoiceSerializer, responses=InvoiceSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None) -> Response:
        invoice = self.get_object()
        serializer = CancelInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.cancel_invoice(
            invoice, reason=serializer.validated_data["reason"], cancelled_by=request.user
        )
        self.audit(Action.UPDATE, invoice)
        return Response(InvoiceSerializer(invoice).data)

    @extend_schema(request=None, responses=InvoiceSerializer)
    @action(detail=True, methods=["post"], url_path="mark-reviewed")
    def mark_reviewed(self, request, pk=None) -> Response:
        """The admin has seen a bill the front desk & pharmacy cancelled."""
        invoice = services.mark_cancel_reviewed(self.get_object())
        return Response(InvoiceSerializer(invoice).data)
