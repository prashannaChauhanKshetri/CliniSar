"""URLs of the dashboard app (mounted under /api/v1/)."""

from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/summary/", views.SummaryView.as_view(), name="dashboard-summary"),
]
