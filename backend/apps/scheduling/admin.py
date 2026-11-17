"""Admin screens for doctor schedules and appointments."""

from django.contrib import admin

from .models import Appointment, DoctorSchedule


@admin.register(DoctorSchedule)
class DoctorScheduleAdmin(admin.ModelAdmin):
    """Working hours of every doctor."""

    list_display = ["doctor", "weekday", "start_time", "end_time", "slot_minutes", "clinic"]
    list_filter = ["clinic", "weekday"]


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    """Appointments of every clinic."""

    list_display = ["date", "start_time", "patient", "doctor", "status", "clinic"]
    list_filter = ["clinic", "status"]
    date_hierarchy = "date"
