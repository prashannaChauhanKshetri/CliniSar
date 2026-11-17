"""URLs of the accounts app (mounted under /api/v1/)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("staff", views.StaffViewSet, basename="staff")
router.register("doctors", views.DoctorViewSet, basename="doctor")
router.register("patients", views.PatientViewSet, basename="patient")

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    *router.urls,
]
