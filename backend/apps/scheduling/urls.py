"""URLs of the scheduling app (mounted under /api/v1/)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("appointments", views.AppointmentViewSet, basename="appointment")

schedule_list = views.DoctorScheduleViewSet.as_view({"get": "list", "post": "create"})
schedule_detail = views.DoctorScheduleViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)

urlpatterns = [
    path("doctors/<uuid:doctor_pk>/schedules/", schedule_list, name="schedule-list"),
    path("doctors/<uuid:doctor_pk>/schedules/<uuid:pk>/", schedule_detail, name="schedule-detail"),
    path("doctors/<uuid:doctor_pk>/slots/", views.SlotsView.as_view(), name="doctor-slots"),
    *router.urls,
]
