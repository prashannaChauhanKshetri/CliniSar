"""Business rules for sessions (login, refresh, logout) and for doctor accounts."""

import datetime

from django.contrib.auth import authenticate
from django.db import IntegrityError, transaction
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.clinics.models import Clinic
from apps.common.exceptions import Conflict

from .models import DoctorProfile, PatientProfile, User


class SessionError(APIException):
    """A 401 answer for a failed login or an unusable refresh token."""

    status_code = 401
    default_detail = "Your session is not valid. Please log in again."
    default_code = "session_error"


def authenticate_user(email: str, password: str) -> User:
    """Return the user for these credentials, or raise a 401.

    The same message is used for a wrong email and a wrong password, so an attacker
    cannot find out which emails are registered.
    """
    user = authenticate(email=email.strip().lower(), password=password)
    if user is None:  # wrong email, wrong password or deactivated user
        raise SessionError("Incorrect email or password.")
    if user.role == User.Role.SUPER_ADMIN:
        raise SessionError("The super admin signs in on the admin site, not here.")
    if not user.clinic.is_active:
        raise SessionError("This clinic has been deactivated.")
    return user


def issue_tokens(user: User) -> tuple[str, str]:
    """Create a fresh (access, refresh) token pair for a user who just logged in."""
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def rotate_tokens(refresh_token: str | None) -> tuple[str, str]:
    """Swap a valid refresh token for a new (access, refresh) pair.

    The old refresh token is blacklisted (see SIMPLE_JWT in settings), so each
    refresh token works exactly once.
    """
    if not refresh_token:
        raise SessionError()
    serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
    try:
        serializer.is_valid(raise_exception=True)
    except (TokenError, AuthenticationFailed) as error:  # expired, blacklisted, user gone
        raise SessionError() from error
    return serializer.validated_data["access"], serializer.validated_data["refresh"]


def revoke_refresh_token(refresh_token: str | None) -> None:
    """Blacklist a refresh token at logout. A missing or already-dead token is fine."""
    if not refresh_token:
        return
    try:
        RefreshToken(refresh_token).blacklist()
    except TokenError:
        pass


@transaction.atomic
def create_doctor(
    clinic: Clinic, user_data: dict, password: str, profile_data: dict
) -> DoctorProfile:
    """Create a doctor's login and profile together, or neither if something fails."""
    user = User.objects.create_user(
        password=password, role=User.Role.DOCTOR, clinic=clinic, **user_data
    )
    return DoctorProfile.objects.create(user=user, **profile_data)


@transaction.atomic
def update_doctor(
    doctor: DoctorProfile, user_data: dict, password: str | None, profile_data: dict
) -> DoctorProfile:
    """Update the doctor's User row and DoctorProfile row in one step."""
    user = doctor.user
    for field, value in user_data.items():
        setattr(user, field, value)
    if password:
        user.set_password(password)
    user.save()

    for field, value in profile_data.items():
        setattr(doctor, field, value)
    doctor.save()
    return doctor


def deactivate_user(user: User) -> None:
    """Switch a login off. Users are never deleted, so their history stays intact."""
    user.is_active = False
    user.save(update_fields=["is_active", "updated_at"])


def estimate_date_of_birth(age_years: int, today: datetime.date) -> datetime.date:
    """Turn an age ("30 yrs") into a date of birth, so the age stays correct next year.

    The patient register records age, not birthday, so we assume the birthday is
    today's day and month. 29 February becomes 28 February in non-leap years.
    """
    year = today.year - age_years
    try:
        return today.replace(year=year)
    except ValueError:  # 29 Feb in a year without it
        return today.replace(year=year, day=28)


def mark_patient_checked(patient: PatientProfile) -> PatientProfile:
    """Clear the "needs checking" flag once the front desk has confirmed the details."""
    patient.needs_review = False
    patient.save(update_fields=["needs_review", "updated_at"])
    return patient


# ---------- patients: one person, one record ----------


class DuplicatePatient(Conflict):
    """409: this name and phone are already registered. Says WHICH patient, so the
    screen can offer to open (or use) the existing record instead."""

    default_code = "duplicate_patient"

    def __init__(self, existing: PatientProfile) -> None:
        super().__init__(
            {
                "detail": f"{existing.full_name} with this phone is already registered.",
                "existing_patient_id": str(existing.id),
                "existing_patient_name": existing.full_name,
            }
        )


def find_duplicate_patient(
    clinic: Clinic, first_name: str, last_name: str, phone: str, exclude_id=None
) -> PatientProfile | None:
    """The patient already registered with this name (any capitals) and phone, if any.

    Name AND phone, because each alone is not enough: family members share a phone,
    and different people share a name. Without a phone we cannot tell two people
    apart, so the screen only warns about same-name patients instead of refusing.
    """
    if not phone:
        return None
    matches = PatientProfile.objects.filter(
        clinic=clinic,
        first_name__iexact=first_name,
        last_name__iexact=last_name,
        phone=phone,
    )
    if exclude_id is not None:
        matches = matches.exclude(pk=exclude_id)
    return matches.first()


def save_patient(serializer, **extra) -> PatientProfile:
    """Save a new or changed patient; a duplicate created at the same moment gets a 409.

    The serializer already refused known duplicates. Only a race (two desks saving the
    same person at once) reaches the database constraint.
    """
    try:
        with transaction.atomic():
            return serializer.save(**extra)
    except IntegrityError as error:
        raise Conflict("This patient was just registered. Please search for them.") from error
