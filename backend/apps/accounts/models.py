"""People: users who log in (clinic staff of every role), doctor details and patients."""

import datetime

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models import Q

from apps.common.models import BaseModel, TenantModel, money_field


class UserManager(BaseUserManager):
    """Creates users identified by email, because the User model has no username."""

    def create_user(self, email: str, password: str | None = None, **extra_fields) -> User:
        """Create a user with a hashed password and a lower-cased email."""
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=email.strip().lower(), **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra_fields) -> User:
        """Create the platform owner used by `manage.py createsuperuser`."""
        extra_fields.setdefault("role", User.Role.SUPER_ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(BaseModel, AbstractUser):
    """Someone who can log in. Belongs to exactly one clinic, except the super admin.

    Note: the role STAFF (front-desk worker) is unrelated to Django's `is_staff` flag,
    which only controls access to the Django admin site.
    """

    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super admin"
        CLINIC_ADMIN = "CLINIC_ADMIN", "Clinic admin"
        STAFF = "STAFF", "Staff"
        DOCTOR = "DOCTOR", "Doctor"
        PHARMACIST = "PHARMACIST", "Pharmacist"
        LAB_TECHNICIAN = "LAB_TECHNICIAN", "Lab technician"

    username = None  # remove AbstractUser's username; people log in with their email
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    clinic = models.ForeignKey(
        "clinics.Clinic", on_delete=models.PROTECT, null=True, blank=True, related_name="users"
    )
    phone = models.CharField(max_length=20, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["first_name", "last_name"]
        constraints = [
            # Only the super admin may exist without a clinic.
            models.CheckConstraint(
                condition=Q(role="SUPER_ADMIN") | Q(clinic__isnull=False),
                name="user_has_clinic_unless_super_admin",
            ),
        ]

    def __str__(self) -> str:
        return self.email


class DoctorProfile(BaseModel):
    """Extra details for a user whose role is DOCTOR. Its clinic is read through the user."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="doctor_profile")
    department = models.ForeignKey(
        "clinics.Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="doctors",
    )
    specialization = models.CharField(max_length=100, blank=True)
    # The next three are printed on the doctor's prescription letterhead.
    name_nepali = models.CharField(max_length=150, blank=True)  # e.g. "डा. आनन्द कुमार झा"
    qualifications = models.CharField(max_length=200, blank=True)  # e.g. "M.B.B.S., M.S."
    designation = models.CharField(max_length=100, blank=True)  # e.g. "Consultant ENT Surgeon"
    # Nepal Medical Council (NMC) registration number.
    license_number = models.CharField(max_length=50, blank=True)
    consultation_fee = money_field(default=0)
    bio = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Dr. {self.user.get_full_name()}"


class PatientProfile(TenantModel):
    """A patient of one clinic. Patients do not log in; staff create and manage them."""

    class Gender(models.TextChoices):
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        OTHER = "OTHER", "Other"

    class BloodGroup(models.TextChoices):
        A_POS = "A+", "A+"
        A_NEG = "A-", "A-"
        B_POS = "B+", "B+"
        B_NEG = "B-", "B-"
        AB_POS = "AB+", "AB+"
        AB_NEG = "AB-", "AB-"
        O_POS = "O+", "O+"
        O_NEG = "O-", "O-"

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    # Optional: the real patient register often has no phone number.
    phone = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    # True when staff entered an age and the date of birth was worked out from it.
    date_of_birth_is_estimated = models.BooleanField(default=False)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    blood_group = models.CharField(max_length=3, choices=BloodGroup.choices, blank=True)
    address = models.CharField(max_length=255, blank=True)
    emergency_contact = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        """The patient's name as shown on lists, invoices and prescriptions."""
        return f"{self.first_name} {self.last_name}".strip()

    def age_on(self, day: datetime.date) -> int | None:
        """Age in whole years on a given day, or None when the date of birth is unknown."""
        if self.date_of_birth is None:
            return None
        born = self.date_of_birth
        had_birthday = (day.month, day.day) >= (born.month, born.day)
        return day.year - born.year - (0 if had_birthday else 1)
