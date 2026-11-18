"""GET dashboard/summary/?range=week|month: the numbers behind the dashboard page."""

from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class SummaryQuerySerializer(serializers.Serializer):
    """The query string: which range to summarise (default: week)."""

    range = serializers.ChoiceField(choices=list(services.RANGE_DAYS), default="week")


class SummaryView(APIView):
    """Every logged-in clinic user gets a dashboard; services.scope_for decides its content."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("range", str, enum=["week", "month"], required=False)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request) -> Response:
        query = SummaryQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return Response(services.summary(request.user, query.validated_data["range"]))
