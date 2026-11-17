"""Admin screens for users, doctors and patients."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import DoctorProfile, PatientProfile, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Django's user admin adjusted for login by email (no username).

    Building on DjangoUserAdmin matters: it hashes the password when the super admin
    creates a clinic's first CLINIC_ADMIN here.
    """

    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "role", "clinic", "is_active"]
    list_filter = ["role", "clinic", "is_active"]
    search_fields = ["email", "first_name", "last_name"]
    # Fields on the "change user" page.
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Personal details", {"fields": ["first_name", "last_name", "phone"]}),
        ("Clinic and role", {"fields": ["clinic", "role"]}),
        ("Access", {"fields": ["is_active", "is_staff", "is_superuser"]}),
    ]
    # Fields on the "add user" page.
    add_fieldsets = [
        (
            None,
            {
                "fields": [
                    "email",
                    "first_name",
                    "last_name",
                    "clinic",
                    "role",
                    "password1",
                    "password2",
                ]
            },
        ),
    ]


@admin.register(DoctorProfile)
class DoctorProfileAdmin(admin.ModelAdmin):
    """Doctor details of every clinic."""

    list_display = ["user", "department", "specialization", "consultation_fee"]
    list_filter = ["user__clinic"]
    search_fields = ["user__email", "user__first_name", "user__last_name"]


@admin.register(PatientProfile)
class PatientProfileAdmin(admin.ModelAdmin):
    """Patients of every clinic."""

    list_display = ["first_name", "last_name", "phone", "clinic"]
    list_filter = ["clinic"]
    search_fields = ["first_name", "last_name", "phone"]
