"""Serializers for the authentication endpoints (the shape of their JSON)."""

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.clinics.models import Clinic

from .models import User


class ClinicSummarySerializer(serializers.ModelSerializer):
    """The few clinic details the front end needs to show who is logged in where."""

    class Meta:
        model = Clinic
        fields = ["id", "name", "slug"]


class UserSerializer(serializers.ModelSerializer):
    """The logged-in user. Only name and phone can be edited by the user themself."""

    clinic = ClinicSummarySerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "phone", "role", "clinic"]
        # A user must never be able to change their own email, role or clinic.
        read_only_fields = ["id", "email", "role"]


class LoginSerializer(serializers.Serializer):
    """Input of POST auth/login/."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class AccessTokenSerializer(serializers.Serializer):
    """Output of POST auth/refresh/."""

    access = serializers.CharField()


class LoginResponseSerializer(AccessTokenSerializer):
    """Output of POST auth/login/: the access token and who logged in."""

    user = UserSerializer()


class ChangePasswordSerializer(serializers.Serializer):
    """Input of POST auth/change-password/. The current password is required."""

    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value: str) -> str:
        """Proves the request comes from the real owner, not from an unlocked screen."""
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("The current password is incorrect.")
        return value

    def validate_new_password(self, value: str) -> str:
        """Run Django's password validators (minimum length 8, not too common, ...)."""
        validate_password(value, user=self.context["request"].user)
        return value
