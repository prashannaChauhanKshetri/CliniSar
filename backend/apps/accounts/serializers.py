"""Serializers for authentication and for managing staff, doctors and patients."""

from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from apps.clinics.models import Clinic, Department
from apps.common.serializers import TenantPrimaryKeyRelatedField

from . import services
from .models import DoctorProfile, PatientProfile, User


class ClinicSummarySerializer(serializers.ModelSerializer):
    """The few clinic details the front end needs to show who is logged in where."""

    class Meta:
        model = Clinic
        fields = ["id", "name", "slug"]


class UserSerializer(serializers.ModelSerializer):
    """The logged-in user. Only name and phone can be edited by the user themself."""

    clinic = ClinicSummarySerializer(read_only=True)
    # For doctors: the id of their DoctorProfile (e.g. to open "My schedule"); else null.
    doctor_profile_id = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "clinic",
            "doctor_profile_id",
        ]
        # A user must never be able to change their own email, role or clinic.
        read_only_fields = ["id", "email", "role"]

    def get_doctor_profile_id(self, user: User) -> str | None:
        profile = getattr(user, "doctor_profile", None)
        return str(profile.id) if profile else None


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


def check_email_is_free(email: str, current_user: User | None) -> str:
    """Return the lower-cased email, or raise a 400 if another user already has it."""
    email = email.strip().lower()
    others = User.objects.filter(email=email)
    if current_user:
        others = others.exclude(pk=current_user.pk)
    if others.exists():
        raise serializers.ValidationError("A user with this email already exists.")
    return email


def check_password_on_create(serializer: serializers.Serializer, data: dict) -> None:
    """A password is required when creating a login, optional when editing one."""
    if serializer.instance is None and not data.get("password"):
        raise serializers.ValidationError({"password": "This field is required."})


class StaffSerializer(serializers.ModelSerializer):
    """A non-doctor login of the clinic: front-desk staff, pharmacist or lab technician."""

    STAFF_ROLES = [User.Role.STAFF, User.Role.PHARMACIST, User.Role.LAB_TECHNICIAN]

    # Only these roles: doctors are created at doctors/, admins by the super admin.
    role = serializers.ChoiceField(choices=STAFF_ROLES)
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "is_active",
            "password",
        ]
        extra_kwargs = {
            # The default unique check is replaced by validate_email below.
            "email": {"validators": []},
            "first_name": {"required": True, "allow_blank": False},
            "last_name": {"required": True, "allow_blank": False},
        }

    def validate_email(self, value: str) -> str:
        return check_email_is_free(value, current_user=self.instance)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate(self, data: dict) -> dict:
        check_password_on_create(self, data)
        return data

    def create(self, validated_data: dict) -> User:
        """Use create_user so the password is stored hashed, never as plain text."""
        return User.objects.create_user(**validated_data)

    def update(self, instance: User, validated_data: dict) -> User:
        password = validated_data.pop("password", None)
        if password:
            instance.set_password(password)
        return super().update(instance, validated_data)


class DoctorSerializer(serializers.ModelSerializer):
    """A doctor shown as one flat object, although it is stored as User + DoctorProfile."""

    # These fields live on the linked User row (source="user....").
    email = serializers.EmailField(source="user.email")
    first_name = serializers.CharField(source="user.first_name", max_length=150)
    last_name = serializers.CharField(source="user.last_name", max_length=150)
    phone = serializers.CharField(
        source="user.phone", max_length=20, required=False, allow_blank=True
    )
    is_active = serializers.BooleanField(source="user.is_active", required=False)
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    # Only a department of the same clinic is accepted.
    department = TenantPrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=False, allow_null=True
    )
    department_name = serializers.CharField(
        source="department.name", read_only=True, allow_null=True
    )

    class Meta:
        model = DoctorProfile
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_active",
            "password",
            "department",
            "department_name",
            "specialization",
            "name_nepali",
            "qualifications",
            "designation",
            "license_number",
            "consultation_fee",
            "bio",
        ]
        extra_kwargs = {"consultation_fee": {"min_value": 0}}

    def validate_email(self, value: str) -> str:
        current_user = self.instance.user if self.instance else None
        return check_email_is_free(value, current_user=current_user)

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate(self, data: dict) -> dict:
        check_password_on_create(self, data)
        return data

    def create(self, validated_data: dict) -> DoctorProfile:
        return services.create_doctor(
            clinic=self.context["request"].user.clinic,
            user_data=validated_data.pop("user"),
            password=validated_data.pop("password"),
            profile_data=validated_data,
        )

    def update(self, instance: DoctorProfile, validated_data: dict) -> DoctorProfile:
        return services.update_doctor(
            doctor=instance,
            user_data=validated_data.pop("user", {}),
            password=validated_data.pop("password", None),
            profile_data=validated_data,
        )


class PatientSerializer(serializers.ModelSerializer):
    """A patient record. There is no clinic field: the clinic comes from the logged-in user.

    Staff may send either date_of_birth or age_years (the paper register only has age).
    """

    full_name = serializers.CharField(read_only=True)
    age = serializers.SerializerMethodField()
    age_years = serializers.IntegerField(
        write_only=True, required=False, min_value=0, max_value=130
    )

    class Meta:
        model = PatientProfile
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "date_of_birth",
            "date_of_birth_is_estimated",
            "age",
            "age_years",
            "gender",
            "blood_group",
            "address",
            "emergency_contact",
            "created_at",
        ]
        read_only_fields = ["date_of_birth_is_estimated"]

    def get_age(self, patient: PatientProfile) -> int | None:
        """Age today in Nepal, worked out from the date of birth."""
        return patient.age_on(timezone.localdate())

    def validate_date_of_birth(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError("Date of birth cannot be in the future.")
        return value

    def validate(self, data: dict) -> dict:
        """Turn age_years into an estimated date of birth."""
        age_years = data.pop("age_years", None)
        if age_years is not None and data.get("date_of_birth"):
            raise serializers.ValidationError("Send either date_of_birth or age_years, not both.")
        if age_years is not None:
            data["date_of_birth"] = services.estimate_date_of_birth(age_years, timezone.localdate())
            data["date_of_birth_is_estimated"] = True
        elif "date_of_birth" in data:
            data["date_of_birth_is_estimated"] = False
        return data
