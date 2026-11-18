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
from apps.billing.models import Invoice
from apps.clinics.models import Clinic, Department
from apps.lab import services as lab
from apps.lab.models import LabTest
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

# Lab tests as on real report templates. Rows: (name, unit, reference range, section).
LAB_TESTS = [
    {
        "name": "CBC",
        "price": "500.00",
        "category": "HEMATOLOGY REPORT",
        "specimen": "Whole Blood",
        "rows": [
            ("Hemoglobin (Hb)", "gm%", "11-16", ""),
            ("Total Leucocyte Count (WBC)", "Cells/cumm", "4000-11000", ""),
            ("RBC Count", "Million cells/cumm", "4.5-5.5", ""),
            ("Platelets Count", "Lakh cells/cumm", "1.5-4.5", ""),
            ("Neutrophils", "%", "45-75", "Differential Leucocyte Count"),
            ("Lymphocytes", "%", "20-40", "Differential Leucocyte Count"),
            ("Monocytes", "%", "1-6", "Differential Leucocyte Count"),
            ("Eosinophils", "%", "2-8", "Differential Leucocyte Count"),
            ("Basophils", "%", "0-1", "Differential Leucocyte Count"),
            ("PCV", "%", "36-45", ""),
            ("MCV", "fl", "72-95", ""),
            ("MCH", "pg", "25-29", ""),
            ("MCHC", "%", "31-36", ""),
            ("ESR", "mm/hr", "0-20", ""),
        ],
    },
    {
        "name": "RBS",
        "price": "150.00",
        "category": "BIOCHEMICAL REPORT",
        "specimen": "Serum",
        "rows": [("Random Blood Sugar", "mg/dl", "70-140", "")],
    },
    {
        "name": "LFT",
        "price": "1200.00",
        "category": "BIOCHEMICAL REPORT",
        "specimen": "Serum",
        "rows": [
            ("S. Bilirubin (Total)", "mg/dl", "0.2-1.2", ""),
            ("S. Bilirubin (Direct)", "mg/dl", "0.0-0.4", ""),
            ("SGPT", "U/L", "10-49", ""),
            ("SGOT", "U/L", "10-46", ""),
            ("Serum Alkaline Phosphatase", "U/L", "64-290", ""),
            ("Albumin", "g/dl", "3.5-5.2", ""),
            ("Total Protein", "g/dl", "6-8", ""),
        ],
    },
    {
        "name": "Lipid Profile",
        "price": "1000.00",
        "category": "BIOCHEMICAL REPORT",
        "specimen": "Serum",
        "rows": [
            ("Triglycerides", "mg/dl", "40-165", ""),
            ("Total Cholesterol", "mg/dl", "150-220", ""),
            ("HDL Cholesterol", "mg/dl", "35-65", ""),
            ("LDL Cholesterol", "mg/dl", "Up to 150", ""),
            ("VLDL Cholesterol", "mg/dl", "3-32", ""),
        ],
    },
    {
        "name": "Serology",
        "price": "800.00",
        "category": "SEROLOGY REPORT",
        "specimen": "Serum",
        "rows": [(name, "", "Non-Reactive", "") for name in ("HIV", "HBsAg", "HCV", "VDRL")],
    },
    {
        "name": "Urine RE",
        "price": "200.00",
        "category": "URINE ANALYSIS",
        "specimen": "Urine",
        "rows": [
            ("Color", "", "", "Physical Examination"),
            ("Appearance", "", "", "Physical Examination"),
            ("Reaction (pH)", "", "", "Physical Examination"),
            ("Protein", "", "Nil", "Chemical Examination"),
            ("Sugar", "", "Nil", "Chemical Examination"),
            ("Pus Cells", "/HPF", "0-5", "Microscopic Examination"),
            ("Red Blood Cells", "/HPF", "Nil", "Microscopic Examination"),
            ("Epithelial Cells", "/HPF", "0-5", "Microscopic Examination"),
        ],
    },
    {
        "name": "CRP Quantitative",
        "price": "900.00",
        "category": "IMMUNOLOGY REPORT",
        "method": "Fluorescence Immunoassay (FIA)",
        "specimen": "Serum",
        "interpretation": "C-Reactive Protein rises within 4-6 hours of infection, "
        "inflammation or tissue injury and falls as the inflammation subsides.",
        "rows": [("CRP Quantitative", "mg/L", "0.0-5.0", "")],
    },
    {
        "name": "HbA1c",
        "price": "1200.00",
        "category": "BIOCHEMISTRY REPORT",
        "method": "Fluorescence Immunoassay (FIA)",
        "specimen": "Whole Blood",
        "rows": [("HbA1c", "%", "4.0-6.5", "")],
    },
]

# Results for the demo's completed order (CBC + RBS); ABNORMAL where outside the range.
DEMO_RESULTS = {
    "Hemoglobin (Hb)": ("10.2", "ABNORMAL"),
    "Total Leucocyte Count (WBC)": ("9,900", "NORMAL"),
    "RBC Count": ("4.6", "NORMAL"),
    "Platelets Count": ("1.90", "NORMAL"),
    "Neutrophils": ("65", "NORMAL"),
    "Lymphocytes": ("30", "NORMAL"),
    "Monocytes": ("05", "NORMAL"),
    "Eosinophils": ("00", "ABNORMAL"),
    "Basophils": ("00", "NORMAL"),
    "PCV": ("38.3", "NORMAL"),
    "MCV": ("90.9", "NORMAL"),
    "MCH": ("29.0", "NORMAL"),
    "MCHC": ("31.9", "NORMAL"),
    "ESR": ("10", "NORMAL"),
    "Random Blood Sugar": ("162", "ABNORMAL"),
}

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
                if not LabTest.objects.filter(clinic=clinic).exists():
                    seed_lab(clinic)
                    added.append(f"{clinic.name}: lab tests and lab orders")
                if not has_history(clinic):
                    seed_history(clinic)
                    added.append(f"{clinic.name}: two months of visit history")

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


# ---------- lab ----------


def seed_lab(clinic: Clinic) -> None:
    """The lab's tests, then one order in each state: completed, sample taken, just ordered."""
    for details in LAB_TESTS:
        details = dict(details)
        rows = details.pop("rows")
        lab_test = LabTest.objects.create(
            clinic=clinic, **{**details, "price": Decimal(details["price"])}
        )
        lab.save_parameters(
            lab_test,
            [{"name": n, "unit": u, "reference_range": r, "section": s} for n, u, r, s in rows],
        )

    lab_tech = clinic.users.get(role=User.Role.LAB_TECHNICIAN)
    staff = clinic.users.get(role=User.Role.STAFF)
    tests = {test.name: test for test in LabTest.objects.filter(clinic=clinic)}
    visits = Appointment.objects.filter(clinic=clinic, status=Appointment.Status.COMPLETED)

    # 1. A doctor's order from a past visit, finished, bill paid.
    visit = visits.order_by("-date").first()
    done = lab.create_lab_order(
        clinic=clinic,
        tests=[tests["CBC"], tests["RBS"]],
        ordered_by=visit.doctor.user,
        appointment=visit,
    )
    lab.collect_sample(done, user=lab_tech)
    lab.complete_lab_order(done, user=lab_tech, results=demo_results(done))
    billing.pay_invoice(done.invoice, payment_method="CASH", received_by=staff)

    # 2. A patient who came to the lab on their own ("Consultant: Self"), sample taken.
    walk_in_patient = PatientProfile.objects.filter(clinic=clinic).order_by("first_name").last()
    self_referred = lab.create_lab_order(
        clinic=clinic,
        tests=[tests["Serology"], tests["Urine RE"]],
        ordered_by=lab_tech,
        patient=walk_in_patient,
    )
    lab.collect_sample(self_referred, user=lab_tech)

    # 3. Ordered by a doctor from another past visit, waiting for the sample.
    visit = visits.order_by("-date")[1]
    lab.create_lab_order(
        clinic=clinic, tests=[tests["LFT"]], ordered_by=visit.doctor.user, appointment=visit
    )


def demo_results(order) -> list[dict]:
    rows = []
    for item in order.items.all():
        for parameter in item.lab_test.parameters.all():
            value, flag = DEMO_RESULTS[parameter.name]
            rows.append({"parameter": parameter.pk, "value": value, "flag": flag})
    return rows


# ---------- history for the dashboard ----------


def has_history(clinic: Clinic) -> bool:
    """True when the clinic already has visits older than three weeks."""
    three_weeks_ago = timezone.localdate() - datetime.timedelta(days=21)
    return Appointment.objects.filter(clinic=clinic, date__lt=three_weeks_ago).exists()


def seed_history(clinic: Clinic) -> None:
    """Two months of past visits, so the week and month comparisons have data.

    Demo only: payments are dated on the day of their visit, and patients' sign-up
    dates are spread over the two months. In real use these timestamps are set by
    the moment things happen.
    """
    staff = clinic.users.get(role=User.Role.STAFF)
    doctors = list(DoctorProfile.objects.filter(user__clinic=clinic))
    patients = list(PatientProfile.objects.filter(clinic=clinic).order_by("first_name"))
    for days_ago in range(15, 60):
        busy_day = days_ago % 7 in (1, 2)  # some days are busier, so the charts vary
        for _ in range(2 if busy_day else 1):
            add_past_visit(clinic, random.choice(doctors), random.choice(patients), staff, days_ago)

    date_payments_on_visit_day(clinic)
    for index, patient in enumerate(patients):
        signed_up = timezone.now() - datetime.timedelta(days=index * 6)
        PatientProfile.objects.filter(pk=patient.pk).update(created_at=signed_up)


def date_payments_on_visit_day(clinic: Clinic) -> None:
    """Move each paid consultation bill's payment time to noon on its visit's date."""
    paid = Invoice.objects.filter(
        clinic=clinic, status=Invoice.Status.PAID, appointment__isnull=False
    ).select_related("appointment")
    for invoice in paid:
        visit_day = invoice.appointment.date
        if visit_day < timezone.localdate():
            noon = datetime.datetime.combine(visit_day, datetime.time(12, 0))
            invoice.paid_at = timezone.make_aware(noon)
            invoice.save(update_fields=["paid_at"])


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
        # next number in that doctor's queue for that day
        queue_number=Appointment.objects.filter(doctor=doctor, date=day).count() + 1,
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
