# CliniSar in one page

A compact guide to the whole project. For the build history, see [PHASES.md](PHASES.md).

## What it is

A clinic management system for clinics in Nepal. Many clinics share one deployment
(multi-tenant), and each clinic only ever sees its own data. Only clinic staff log in;
patients are records that staff manage.

## Stack

| Part       | Tools                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Back end   | Python 3.14, Django 5.2 LTS, Django REST Framework, simplejwt (JWT)    |
| Database   | PostgreSQL                                                             |
| Front end  | React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form |
| Tests      | pytest + factory_boy (back end), Vitest (front end)                    |
| Lint       | Ruff (Python), ESLint + Prettier (TypeScript)                          |
| Deployment | Docker, Nginx, GitHub Actions, AWS (EC2, RDS, S3, CloudFront)          |

## Folder map

```
backend/
  config/          settings (base, dev, prod), urls, wsgi
  apps/common/     base models, TenantViewSet, permissions, audit log, middleware
  apps/clinics/    Clinic, Department
  apps/accounts/   User, DoctorProfile, PatientProfile, login endpoints
  apps/scheduling/ DoctorSchedule, Appointment, slot logic
  apps/records/    Prescription, PrescriptionItem, Document
  apps/pharmacy/   Medicine, MedicineBatch, StockMovement, dispensing
  apps/lab/        LabTest, LabOrder
  apps/billing/    Invoice, InvoiceItem, payments, VAT
  apps/dashboard/  summary endpoint (no models)
frontend/src/
  api/ components/ features/ pages/ print/ routes/
  lib/             date.ts (Bikram Sambat), money.ts (rupee formatting)
```

Inside each Django app: `models.py` (tables), `serializers.py` (JSON in and out),
`views.py` (thin endpoints), `services.py` (business rules), `tests/`.

## The five ideas to understand first

1. **Multi-tenancy.** Every clinic-owned table has a `clinic` column. Every endpoint
   inherits `TenantViewSet`, which filters by `request.user.clinic` and sets the clinic
   on create. The client can never send a clinic id. Another clinic's object returns 404.
2. **Roles.** Each user has one role, and each role sees only its part of the system
   (table below). Role checks are permission classes; row limits are done by narrowing
   the queryset.
3. **Rules live in `services.py`.** Booking, dispensing and invoicing each run inside
   one database transaction, so they either fully happen or not at all.
4. **Computed, not stored.** Free slots are calculated from the doctor's schedule.
   Available stock is the sum of unexpired batches. This avoids numbers going out of
   sync.
5. **Nepal localisation is front end only.** The API uses AD dates and UTC. The front
   end shows Bikram Sambat dates and "Rs. 1,25,000.00" amounts.

## Roles

| Role           | Can do                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| SUPER_ADMIN    | Django admin only: create clinics and their first admin                 |
| CLINIC_ADMIN   | Clinic settings and VAT, staff, doctors, departments; everything STAFF can |
| STAFF          | Patients, appointments, documents, all invoices                         |
| DOCTOR         | Own schedule and appointments, prescriptions and lab orders             |
| PHARMACIST     | Medicines, batches, stock, dispensing, PHARMACY invoices                |
| LAB_TECHNICIAN | Lab tests, lab orders, LAB invoices                                     |

## Main flows

**Appointment.** Staff pick a doctor, date and free slot, then book. A unique
constraint on (doctor, date, start time) stops double booking; a clash returns 409.
Booking creates a CONSULTATION invoice.

**Prescription and pharmacy.** The doctor writes a prescription for their own
appointment. The pharmacist dispenses it: stock is taken from the batch that expires
first, moving to the next batch if needed. Expired batches are never used. If stock is
short, nothing changes and the API returns 409. Dispensing creates a PHARMACY invoice.

**Stock.** Stock is held per batch. Every change (purchase, dispense, adjustment) goes
through one function that locks the batch row, updates its quantity and writes a
`StockMovement` row. Movements are never edited or deleted.

**Lab.** A doctor orders a test, which creates a LAB invoice. Status only moves
ORDERED -> SAMPLE_COLLECTED -> COMPLETED, or ORDERED -> CANCELLED.

**Invoice.** Never typed by hand; created by the three events above. Numbers are
sequential per clinic. One function does the maths:

```
subtotal   = sum of line totals
taxable    = subtotal - discount
vat_amount = taxable x vat_rate / 100   (rounded half up to 2 decimals)
total      = taxable + vat_amount
```

VAT is optional per clinic and per source. The rate is copied onto the invoice when it
is created, so changing settings later never changes old invoices. A PAID invoice is
locked. There are no refunds.

## Security in short

- Login returns a 15-minute access token in JSON; the front end keeps it in memory.
- A 7-day refresh token sits in an httpOnly cookie that JavaScript cannot read.
- Login is limited to 5 attempts per minute per IP.
- Uploaded files: PDF, JPG, PNG only, 10 MB maximum, in a private S3 bucket.

## Phases

| #   | What                                                 | Status |
| --- | ---------------------------------------------------- | ------ |
| 0   | Scaffold, Docker Compose, linters, CI                | Done   |
| 1   | Models, migrations, admin, factories                 | Done   |
| 2   | Authentication, permissions, request log middleware  | Done   |
| 3   | TenantViewSet, clinic endpoints, tenant isolation test |      |
| 4   | Schedules, slots, appointments                       |        |
| 5   | Billing: invoices, numbering, VAT, pay, cancel       |        |
| 6   | Prescriptions and pharmacy                           |        |
| 7   | Lab, documents, audit log                            |        |
| 8   | Dashboard summary, demo data command                 |        |
| 9   | Front-end foundation                                 |        |
| 10  | Front-end pages, print pages, dashboard              |        |
| 11  | Production Docker, CI/CD, deployment guide, README   |        |

## Not in this project

Patient login, chat, video calls, online payment gateways, refunds, walk-in pharmacy
sales, suppliers, email or SMS, multi-language text.
