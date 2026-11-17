"""URLs of the accounts app (mounted under /api/v1/)."""

from django.urls import path

from . import views

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
]
