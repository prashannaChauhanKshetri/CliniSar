"""Endpoints for medicines, batches and stock history. Stock rules live in services.py."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import IsClinicAdmin, IsDoctor, IsPharmacist, IsStaff, ReadOnly
from apps.common.views import TenantViewSet

from . import services
from .filters import BatchFilter, MedicineFilter
from .models import Medicine, MedicineBatch, StockMovement
from .serializers import (
    AdjustmentSerializer,
    MedicineBatchSerializer,
    MedicineSerializer,
    PurchaseSerializer,
    StockMovementSerializer,
)

# Admin and pharmacist manage the pharmacy; doctors may read medicines to prescribe them.
# The front desk (STAFF) also runs the pharmacy: in a small clinic one person often
# registers patients and hands out medicines at the same counter.
PHARMACY_MANAGERS = IsClinicAdmin | IsPharmacist | IsStaff


class MedicineViewSet(TenantViewSet):
    """CRUD medicines/ (with available_stock), plus nested batches/ and stock-movements/."""

    # order_by is needed: Django drops the model's default order on aggregate queries.
    queryset = Medicine.objects.with_available_stock().order_by("name", "strength")
    serializer_class = MedicineSerializer
    filterset_class = MedicineFilter
    search_fields = ["name", "generic_name"]

    def get_permissions(self):
        if self.action in ("batches", "stock_movements"):
            return [PHARMACY_MANAGERS()]
        return [(PHARMACY_MANAGERS | (IsDoctor & ReadOnly))()]

    @extend_schema(methods=["GET"], request=None, responses=MedicineBatchSerializer(many=True))
    @extend_schema(
        methods=["POST"], request=PurchaseSerializer, responses={201: MedicineBatchSerializer}
    )
    @action(detail=True, methods=["get", "post"])
    def batches(self, request, pk=None) -> Response:
        """GET: the medicine's batches. POST: record a purchase (a new batch)."""
        medicine = self.get_object()
        if request.method == "GET":
            batches = medicine.batches.all()
            page = self.paginate_queryset(batches)
            return self.get_paginated_response(MedicineBatchSerializer(page, many=True).data)

        serializer = PurchaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        batch = services.record_purchase(medicine, user=request.user, **serializer.validated_data)
        return Response(MedicineBatchSerializer(batch).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=StockMovementSerializer(many=True))
    @action(detail=True, url_path="stock-movements")
    def stock_movements(self, request, pk=None) -> Response:
        """GET: every stock change of this medicine, newest first."""
        medicine = self.get_object()
        movements = StockMovement.objects.filter(batch__medicine=medicine).select_related(
            "batch", "created_by"
        )
        page = self.paginate_queryset(movements)
        return self.get_paginated_response(StockMovementSerializer(page, many=True).data)


class BatchViewSet(TenantViewSet):
    """batches/: list and view batches (filter expiring or expired), plus adjust/.

    Batches are created by a purchase (medicines/<id>/batches/) and never edited
    directly, so there is no POST, PATCH or DELETE here.
    """

    queryset = MedicineBatch.objects.select_related("medicine")
    serializer_class = MedicineBatchSerializer
    filterset_class = BatchFilter
    permission_classes = [PHARMACY_MANAGERS]
    http_method_names = ["get", "post"]

    def create(self, request, *args, **kwargs):
        return self.http_method_not_allowed(request, *args, **kwargs)

    @extend_schema(request=AdjustmentSerializer, responses=MedicineBatchSerializer)
    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None) -> Response:
        """Correct the stock of one batch with a reason (also used to write off expired stock)."""
        batch = self.get_object()
        serializer = AdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.adjust_stock(batch, user=request.user, **serializer.validated_data)
        batch.refresh_from_db()
        return Response(MedicineBatchSerializer(batch).data)
