"""manage.py seed_demo: fill the database with two made-up clinics for demos and manual testing.

Everything here is invented. Visits, stock and prescriptions go through the same
services the API uses, so bills and stock movements are exactly as in real use.
Running it again only adds parts that are missing (for example the pharmacy, which
was added to the demo later); it never duplicates anything.
"""

import datetime
import random
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import DoctorProfile, PatientProfile, User
from apps.accounts.services import estimate_date_of_birth
from apps.billing import services as billing
from apps.clinics.models import Clinic, Department
from apps.pharmacy import services as pharmacy
from apps.pharmacy.models import Medicine, MedicineBatch
from apps.records import services as records
from apps.scheduling import services as scheduling
from apps.scheduling.models import Appointment, DoctorSchedule

PASSWORD = "demo-pass-123"

CLINICS = [
    {
        "slug": "sunrise",
        "name": "Sunrise Health Clinic",
        "name_nepali": "सनराइज हेल्थ क्लिनिक",
        "address": "Nepalgunj-5, Banke",
        "address_nepali": "नेपालगन्ज-५, बाँके",
        "phone": "081-500001",
        "pan_number": "100000001",
        "prescription_note": "यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।",
        # VAT on for pharmacy only; the lab bills separately, like the real clinic.
        "vat_rate": Decimal("13.00"),
        "vat_on_pharmacy": True,
        "lab_bills_separately": True,
        "lab_name": "Sunrise Path Lab",
        "lab_pan_number": "100000002",
    },
    {
        "slug": "himal",
        "name": "Himal Care Clinic",
        "name_nepali": "हिमाल केयर क्लिनिक",
        "address": "Kohalpur-3, Banke",
        "address_nepali": "कोहलपुर-३, बाँके",
        "phone": "081-500002",
        "pan_number": "200000001",
        "prescription_note": "यो पर्चाको म्याद १५ दिन मात्र हुनेछ ।",
        # VAT switched off everywhere.
    },
]

DOCTORS = [
    # first, last, department, specialization, designation, fee
    ("Anil", "Sharma", "General Medicine", "General Physician", "Medical Officer", "500.00"),
    (
        "Sunita",
        "Karki",
        "Gynecology",
        "Obstetrician & Gynecologist",
        "Consultant Gynecologist",
        "800.00",
    ),
    ("Bikash", "Thapa", "ENT", "ENT Surgeon", "Consultant ENT Surgeon", "700.00"),
]

PATIENTS = [
    # first, last, age, gender, address, phone ("" = none, as often in the paper register)
    ("Ramesh", "Adhikari", 45, "MALE", "Nepalgunj-10, Banke", "9800000001"),
    ("Gita", "Chaudhary", 30, "FEMALE", "Rajapur, Bardiya", ""),
    ("Hari", "Gurung", 62, "MALE", "Kohalpur, Banke", "9800000003"),
    ("Sita", "Tharu", 24, "FEMALE", "Gulariya, Bardiya", "9800000004"),
    ("Krishna", "Bhandari", 8, "MALE", "Nepalgunj-1, Banke", ""),
    ("Maya", "Rai", 35, "FEMALE", "Tulsipur, Dang", "9800000006"),
    ("Dipak", "Oli", 51, "MALE", "Surkhet", "9800000007"),
    ("Laxmi", "Shah", 28, "FEMALE", "Nepalgunj-18, Banke", "9800000008"),
    ("Bimala", "Khadka", 40, "FEMALE", "Janaki, Banke", ""),
    ("Suresh", "Pun", 19, "MALE", "Salyan", "9800000010"),
]

MEDICINES = [
    # name, generic, strength, form, price, reorder level, batches [(number, qty, expires in days)]
    ("Paracetamol", "Paracetamol", "500mg", "Tablet", "2.00", 100, [("PCM-101", 400, 300)]),
    # One batch expires soon (within 90 days) and is dispensed first.
    (
        "Amoxicillin",
        "Amoxicillin",
        "500mg",
        "Capsule",
        "12.00",
        50,
        [("AMX-201", 60, 45), ("AMX-202", 200, 400)],
    ),
    # One batch has already expired: it is never dispensed and not counted as stock.
    (
        "Cetirizine",
        "Cetirizine",
        "10mg",
        "Tablet",
        "3.00",
        30,
        [("CTZ-301", 40, -20), ("CTZ-302", 150, 500)],
    ),
    ("Omeprazole", "Omeprazole", "20mg", "Capsule", "6.00", 30, [("OMP-401", 120, 250)]),
    ("ORS", "Oral rehydration salts", "21g", "Sachet", "20.00", 20, [("ORS-501", 80, 200)]),
    # Low stock: 8 left with a reorder level of 10.
    ("Cough Syrup", "Dextromethorphan", "100ml", "Syrup", "120.00", 10, [("CS-601", 8, 180)]),
]

PRESCRIPTIONS = [
    # diagnosis, [(medicine name, dosage, frequency, days, quantity)], dispense?
    (
        "Viral fever",
        [
            ("Paracetamol", "500mg", "1-1-1", 3, 9),
            ("ORS", "1 sachet", "after each loose motion", 2, 4),
        ],
        True,
    ),
    (
        "Upper respiratory tract infection",
        [("Amoxicillin", "500mg", "1-1-1", 5, 15), ("Cetirizine", "10mg", "0-0-1", 5, 5)],
        True,
    ),
    ("Gastritis", [("Omeprazole", "20mg", "1-0-0 before breakfast", 14, 14)], False),
]

# Saturday is the weekly holiday in Nepal; doctors work Sunday to Friday mornings.
WORKING_DAYS = [
    DoctorSchedule.Weekday.SUNDAY,
    DoctorSchedule.Weekday.MONDAY,
    DoctorSchedule.Weekday.TUESDAY,
    DoctorSchedule.Weekday.WEDNESDAY,
    DoctorSchedule.Weekday.THURSDAY,
    DoctorSchedule.Weekday.FRIDAY,
]


class Command(BaseCommand):
    help = "Create two demo clinics with users, doctors, patients, visits and bills."

    def handle(self, *args, **options) -> None:
        random.seed(2083)  # the same demo data every time
        added = []
        with transaction.atomic():
            for details in CLINICS:
                clinic = Clinic.objects.filter(slug=details["slug"]).first()
                if clinic is None:
                    clinic = seed_clinic(details)
                    added.append(f"{clinic.name}: clinic, people and visits")
                if not Medicine.objects.filter(clinic=clinic).exists():
                    seed_pharmacy(clinic)
                    added.append(f"{clinic.name}: medicines and prescriptions")

        if added:
            self.stdout.write(self.style.SUCCESS("Added:\n  " + "\n  ".join(added) + "\n"))
        else:
            self.stdout.write("The demo data is already complete; nothing was changed.\n")
        self.stdout.write(logins_table())


# ---------- building one clinic ----------


def seed_clinic(details: dict) -> Clinic:
    """Create one clinic with its staff, doctors, patients, visits and bills."""
    clinic = Clinic.objects.create(**details)
    slug = clinic.slug
    make_user(clinic, f"admin@{slug}.demo", User.Role.CLINIC_ADMIN, "Clinic", "Admin")
    staff = make_user(clinic, f"staff@{slug}.demo", User.Role.STAFF, "Front", "Desk")
    make_user(clinic, f"pharmacist@{slug}.demo", User.Role.PHARMACIST, "Pharmacy", "Counter")
    make_user(clinic, f"lab@{slug}.demo", User.Role.LAB_TECHNICIAN, "Lab", "Technician")

    doctors = [make_doctor(clinic, *row) for row in DOCTORS]
    patients = [make_patient(clinic, *row) for row in PATIENTS]
    make_visits(clinic, doctors, patients, staff)
    return clinic


def make_user(clinic: Clinic, email: str, role: str, first: str, last: str) -> User:
    return User.objects.create_user(
        email, PASSWORD, role=role, clinic=clinic, first_name=first, last_name=last
    )


def make_doctor(clinic, first, last, department, specialization, designation, fee):
    """A doctor login, profile and Sunday-Friday 09:00-13:00 schedule."""
    email = f"dr.{first.lower()}@{clinic.slug}.demo"
    user = make_user(clinic, email, User.Role.DOCTOR, first, last)
    doctor = DoctorProfile.objects.create(
        user=user,
        department=Department.objects.get_or_create(clinic=clinic, name=department)[0],
        specialization=specialization,
        designation=designation,
        qualifications="M.B.B.S., M.D.",
        license_number=str(random.randint(10000, 19999)),
        consultation_fee=Decimal(fee),
    )
    for weekday in WORKING_DAYS:
        DoctorSchedule.objects.create(
            clinic=clinic,
            doctor=doctor,
            weekday=weekday,
            start_time=datetime.time(9, 0),
            end_time=datetime.time(13, 0),
            slot_minutes=20,
        )
    return doctor


def make_patient(clinic, first, last, age, gender, address, phone) -> PatientProfile:
    """A patient registered by age, as on the paper register."""
    return PatientProfile.objects.create(
        clinic=clinic,
        first_name=first,
        last_name=last,
        date_of_birth=estimate_date_of_birth(age, timezone.localdate()),
        date_of_birth_is_estimated=True,
        gender=gender,
        address=address,
        phone=phone,
    )


# ---------- pharmacy and prescriptions ----------


def seed_pharmacy(clinic: Clinic) -> None:
    """Medicines with batches, then prescriptions for past visits (most dispensed)."""
    pharmacist = clinic.users.get(role=User.Role.PHARMACIST)
    for name, generic, strength, form, price, reorder, batches in MEDICINES:
        medicine = Medicine.objects.create(
            clinic=clinic,
            name=name,
            generic_name=generic,
            strength=strength,
            form=form,
            unit_price=Decimal(price),
            reorder_level=reorder,
        )
        for batch_number, quantity, expires_in in batches:
            add_batch(medicine, batch_number, quantity, expires_in, pharmacist)

    past_visits = Appointment.objects.filter(
        clinic=clinic, status=Appointment.Status.COMPLETED, prescription__isnull=True
    ).order_by("-date")
    for visit, (diagnosis, lines, dispense) in zip(past_visits, PRESCRIPTIONS, strict=False):
        prescription = records.create_prescription(
            appointment=visit,
            doctor_user=visit.doctor.user,
            diagnosis=diagnosis,
            notes="",
            items=[prescription_line(clinic, *line) for line in lines],
        )
        if dispense:
            pharmacy.dispense_prescription(prescription, user=pharmacist)


def add_batch(medicine, batch_number, quantity, expires_in, pharmacist) -> None:
    """Buy a batch through the stock service.

    A purchase refuses a past expiry date (correctly), so the demo's already-expired
    batch is created empty and filled through change_stock(), like an old purchase.
    """
    expiry_date = timezone.localdate() + datetime.timedelta(days=expires_in)
    if expires_in > 0:
        pharmacy.record_purchase(
            medicine,
            batch_number=batch_number,
            expiry_date=expiry_date,
            quantity=quantity,
            user=pharmacist,
        )
        return
    batch = MedicineBatch.objects.create(
        clinic=medicine.clinic,
        medicine=medicine,
        batch_number=batch_number,
        expiry_date=expiry_date,
        quantity=0,
    )
    pharmacy.change_stock(
        batch, change=quantity, reason="PURCHASE", note="Purchase", user=pharmacist
    )


def prescription_line(clinic, name, dosage, frequency, days, quantity) -> dict:
    return {
        "medicine": Medicine.objects.get(clinic=clinic, name=name),
        "dosage": dosage,
        "frequency": frequency,
        "duration_days": days,
        "quantity": quantity,
        "instructions": "",
    }


# ---------- visits and bills ----------


def make_visits(clinic, doctors, patients, staff) -> None:
    """Past visits (completed and paid), today's walk-ins, and future bookings."""
    today = timezone.localdate()
    for days_ago in range(1, 15):
        add_past_visit(clinic, random.choice(doctors), random.choice(patients), staff, days_ago)

    for patient in patients[:4]:  # today's walk-in queue
        scheduling.add_walk_in(
            clinic=clinic,
            patient=patient,
            doctor=doctors[0],
            reason="Fever and body ache",
            booked_by=staff,
        )

    for days_ahead, patient in enumerate(patients[4:8], start=1):  # bookings ahead
        day = next_working_day(today + datetime.timedelta(days=days_ahead))
        doctor = doctors[days_ahead % len(doctors)]
        slot = scheduling.free_slots(doctor, day)[0]
        scheduling.book_appointment(
            clinic=clinic,
            patient=patient,
            doctor=doctor,
            day=day,
            start_time=slot.start_time,
            reason="Follow-up",
            booked_by=staff,
        )


def add_past_visit(clinic, doctor, patient, staff, days_ago: int) -> None:
    """A finished visit in the past with its bill, usually paid.

    The booking service refuses past slots (correctly), so old visits are written
    directly and billed through the normal invoice service.
    """
    day = timezone.localdate() - datetime.timedelta(days=days_ago)
    appointment = Appointment.objects.create(
        clinic=clinic,
        patient=patient,
        doctor=doctor,
        visit_type=Appointment.VisitType.WALK_IN,
        date=day,
        queue_number=1,
        status=Appointment.Status.COMPLETED,
        reason="Check-up",
        booked_by=staff,
    )
    invoice = billing.create_consultation_invoice(appointment)
    if days_ago % 5 != 0:  # a few old bills are left unpaid on purpose
        method = random.choice(["CASH", "CASH", "WALLET", "CARD"])
        billing.pay_invoice(invoice, payment_method=method, received_by=staff)


def next_working_day(day: datetime.date) -> datetime.date:
    """Move a Saturday to Sunday."""
    while day.weekday() not in WORKING_DAYS:
        day += datetime.timedelta(days=1)
    return day


# ---------- output ----------


def logins_table() -> str:
    """The demo logins, printed after seeding."""
    lines = [f"\nAll demo passwords: {PASSWORD}\n"]
    for details in CLINICS:
        lines.append(f"{details['name']}  (slug: {details['slug']})")
        users = User.objects.filter(clinic__slug=details["slug"]).order_by("role", "email")
        for user in users:
            lines.append(f"  {user.get_role_display():<15} {user.email}")
        lines.append("")
    return "\n".join(lines)
