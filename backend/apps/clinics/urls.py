"""URLs of the clinics app (mounted under /api/v1/)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("departments", views.DepartmentViewSet, basename="department")

urlpatterns = [
    path("clinic/", views.ClinicView.as_view(), name="clinic"),
    *router.urls,
]
