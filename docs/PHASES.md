# CliniSar build log

One section per phase: what was built, why, and which files to read first.

## Decisions that change the original brief

- **Patients do not log in.** Only clinic staff have accounts (clinic admin, staff,
  doctor, pharmacist, lab technician, plus the super admin). A patient is a plain
  record that staff create and manage. Because of this, later phases will leave out:
  the PATIENT role and `IsPatient` permission, `POST auth/register/`, the
  `/c/:clinicSlug/register` page, and the "patient sees own records" rules.
  `PatientProfile` becomes a clinic-owned model with the patient's own name and phone
  instead of a link to a `User`.
- **Django 5.2 LTS** is used instead of the newest release, because LTS has the
  longest support period.
- **Vitest** is the front-end test runner (the brief asked for unit tests but named
  no tool; Vitest is the standard one for Vite).
- **TypeScript 6.0** instead of 7.0: the ESLint TypeScript plugin does not support
  7.0 yet, and the brief requires ESLint.

## Phase 0 - Scaffold

### What was built

- A Git repository with the folder layout from the brief.
- **Back end**: an empty Django project (`backend/config/`) with settings split into
  `base.py` (shared), `dev.py` and `prod.py`, and nine empty apps under
  `backend/apps/`. There are no models or endpoints yet, only the admin site and the
  API docs page at `/api/docs/`.
- **Front end**: a Vite + React + TypeScript project with Tailwind CSS, showing a
  placeholder page. The empty `src/` folders from the brief are in place.
- **Docker Compose** for development: `db` (PostgreSQL), `backend` (Django) and
  `frontend` (Vite).
- **Linters**: Ruff for Python; ESLint and Prettier for TypeScript.
- **CI** (`.github/workflows/ci.yml`): on every push, runs Ruff, pytest against a
  PostgreSQL service, ESLint, Prettier, Vitest and the front-end build.
- **Tests**: three back-end smoke tests and one front-end smoke test, so the test
  tools are proven to work before real features arrive.

### Why it is built this way

- **Settings come from environment variables** so no password or key is in Git.
  `.env.example` lists every variable. `prod.py` refuses to start without a secret
  key, so a missing secret is noticed immediately instead of silently using a weak one.
- **Three settings files** keep development conveniences (debug mode, any host
  allowed) out of production.
- **`TIME_ZONE = "Asia/Kathmandu"` with `USE_TZ = True`**: timestamps are stored in
  UTC, but "today" and "now" mean Nepal time. A smoke test guards this because slot
  and expiry rules depend on it.
- **The Vite dev server forwards `/api` to Django**, so the browser sees one origin
  in development. This matters in phase 2: the refresh-token cookie is
  `SameSite=Strict` and would not be sent across two different origins.
- **Versions are pinned** in `requirements.txt` so every machine and CI install the
  same packages.

### Versions chosen

Python 3.14, Django 5.2.19 (LTS), Django REST Framework 3.18.3, PostgreSQL 18,
Node 26 (LTS), React 19, Vite 8, Tailwind CSS 4, TypeScript 6.0.

### Files to read first

1. `backend/config/settings/base.py` - all shared settings, top to bottom.
2. `backend/config/settings/dev.py` and `prod.py` - the few lines that differ.
3. `docker-compose.yml` - how the three services start and talk to each other.
4. `.github/workflows/ci.yml` - what runs on every push.
5. `frontend/vite.config.ts` - the Tailwind plugin, the `/api` proxy and test setup.
6. `backend/apps/common/tests/test_setup.py` - the smoke tests.

### Not verified

- `docker compose up` was not run: the Docker daemon was not running on this machine.
  The Compose file passes `docker-compose config`, and the back-end tests were run
  against a local PostgreSQL 17 instead.
- CI has not run yet because the repository has not been pushed to GitHub.

## Phase 1 - Models, migrations, admin, factories

### What was built

- **All database tables** as Django models, one `models.py` per app, with the first
  migration for each app.
- **Django admin** screens for every model, so the super admin can create clinics and
  each clinic's first CLINIC_ADMIN.
- **Factories** (`tests/factories.py` in each app): one line in a test builds a valid
  object together with everything it needs.
- **Tests** (96 in total) for the rules the database enforces.

### Why it is built this way

- **`BaseModel` and `TenantModel`** (`apps/common/models.py`) are abstract classes.
  `BaseModel` gives every table a UUID key and timestamps. `TenantModel` adds the
  `clinic` column. A test lists exactly which models are clinic-owned, so a new table
  cannot forget the clinic column unnoticed.
- **UUID keys** instead of 1, 2, 3: an id in a URL cannot be guessed, and it reveals
  nothing about how many records a clinic has.
- **`money_field()`** is one small function that returns the same `DecimalField` for
  every rupee amount. Decimals are exact; floats are not (0.1 + 0.2 is not 0.3).
- **Custom `User`**: login is by email, so `username` is removed and a small
  `UserManager` creates users. This must be done before the first migration, because
  changing the user model later is very hard.
- **Rules are enforced by the database, not only by Python code.** Even a bug in a
  view cannot break them:
  - a user without a clinic must be the super admin;
  - a schedule must start before it ends;
  - one doctor cannot have two non-cancelled appointments at the same date and time
    (a *conditional* unique constraint, so a cancelled slot can be booked again);
  - a batch quantity can never be negative; a stock movement can never be zero;
  - an invoice points to exactly one of appointment, prescription or lab order;
  - a discount cannot be larger than the subtotal;
  - invoice numbers are unique per clinic.
- **`on_delete=PROTECT`** on medical and money links: a patient with appointments or
  a medicine that was prescribed cannot be deleted by accident.
- **`Medicine` has no stock column.** `Medicine.objects.with_available_stock()` adds
  the number in the same SQL query by summing unexpired batches. A test proves a list
  of medicines needs only one query.
- **`StockMovement` refuses to be edited or deleted** (its `save()` and `delete()`
  raise an error), because it is the permanent history of the stock.
- **`PatientProfile` is a clinic-owned record**, not a login (see the decision at the
  top of this file). It keeps the name from the brief.
- **Weekday numbers** are Monday = 0 to Sunday = 6, the same as Python's
  `date.weekday()`, so no conversion is needed when calculating slots.

### Files to read first

1. `backend/apps/common/models.py` - `BaseModel`, `TenantModel`, `money_field`, `AuditLog`.
2. `backend/apps/clinics/models.py` - `Clinic` (the tenant) and `Department`.
3. `backend/apps/accounts/models.py` - `User`, `UserManager`, `DoctorProfile`, `PatientProfile`.
4. `backend/apps/scheduling/models.py` - look at the conditional unique constraint.
5. `backend/apps/pharmacy/models.py` - `with_available_stock()` and `StockMovement`.
6. `backend/apps/billing/models.py` - the two check constraints on `Invoice`.
7. `backend/apps/accounts/tests/factories.py` - how factories keep one clinic.
8. Any `tests/test_models.py` - each test name is one rule in plain words.

### Not included yet

- No API endpoints, serializers or permissions (phases 2 to 7).
- File type and size checks on uploads come with the upload endpoints in phase 7.

## Phase 2 - Authentication, permissions, request logging

### What was built

- **Five endpoints** under `/api/v1/auth/`:
  - `POST login/` - email and password in; access token and user details out.
  - `POST refresh/` - uses the refresh cookie to return a new access token.
  - `POST logout/` - blacklists the refresh token and removes the cookie.
  - `POST change-password/` - needs the current password.
  - `GET, PATCH me/` - read or edit your own name and phone.
- **Permission classes** in `apps/common/permissions.py`: `IsClinicAdmin`, `IsStaff`,
  `IsDoctor`, `IsPharmacist`, `IsLabTechnician` and the combination `IsAdminOrStaff`.
- **`RequestLogMiddleware`**: adds an `X-Request-ID` header to every response and logs
  method, path, status code and duration.
- There is no `register/` endpoint, because patients do not log in.

### How a session works

1. Login checks the password and creates two tokens.
2. The **access token** (15 minutes) is returned in the JSON body. The front end keeps
   it in memory and sends it as `Authorization: Bearer ...` with every request.
3. The **refresh token** (7 days) is set as a cookie. It is `httpOnly` (JavaScript
   cannot read it, so a script injected into the page cannot steal it), `Secure`
   (HTTPS only), `SameSite=Strict` (other websites cannot make the browser send it)
   and limited to the path `/api/v1/auth/`.
4. When the access token expires, the front end calls `refresh/`. The server returns a
   new access token and a **new** refresh cookie, and blacklists the old refresh
   token. So each refresh token works once; a stolen copy becomes useless.
5. Logout blacklists the current refresh token and deletes the cookie.

### Why it is built this way

- **Two tokens** balance safety and comfort: the token that travels with every
  request lives only 15 minutes, and the long-lived one is locked in a cookie that
  scripts cannot reach.
- **Rules are in `services.py`**, views only read the request and build the response.
- **One error message for a wrong email and a wrong password**, so nobody can find out
  which emails have accounts.
- **Login is limited to 5 attempts per minute per IP address** to slow down password
  guessing.
- **`me/` cannot change email, role or clinic.** Those fields are read-only in the
  serializer, so a user cannot promote themself or move to another clinic.
- **Permission classes answer "may this role use this endpoint?"** Which rows a user
  sees is handled separately by `get_queryset()` in later phases.
- **The request id** lets you match a user's error report to one line in the log.

### Decisions to know about

- **The super admin cannot log in to the API**, only to `/admin/`, as the brief says
  the super admin uses the admin site only.
- **Users of a deactivated clinic cannot log in.** This gives `Clinic.is_active` a
  meaning. Tokens they already hold keep working until they expire.
- **Changing the password does not log out other devices.**
- **The login limit is counted in each server process's memory** (Django's default
  cache), because Redis is not allowed. With several Gunicorn workers the real limit
  is 5 per worker. Phase 11 can move the counter into the database if you want an
  exact limit.
- **`dev.py` switches the cookie's `Secure` flag off**, because browsers do not store
  Secure cookies over plain `http://localhost`.

### Files to read first

1. `backend/apps/accounts/services.py` - the login, refresh and logout rules.
2. `backend/apps/accounts/views.py` - the five thin views.
3. `backend/apps/accounts/cookies.py` - how the refresh cookie is set and cleared.
4. `backend/config/settings/base.py` - `REST_FRAMEWORK`, `SIMPLE_JWT` and the
   `REFRESH_COOKIE_*` settings near the bottom.
5. `backend/apps/common/permissions.py` - the role classes.
6. `backend/apps/common/middleware.py` - the request log.
7. `backend/apps/accounts/tests/test_auth.py` - each test name is one rule.

## Phase 3 - TenantViewSet and the clinic endpoints

### What was built

- **`TenantViewSet`** (`apps/common/views.py`): the base class for every clinic-owned
  endpoint. It does two things:
  - `get_queryset()` filters every query by `request.user.clinic`;
  - `perform_create()` stamps `request.user.clinic` on every new row.
- **`TenantPrimaryKeyRelatedField`** (`apps/common/serializers.py`): a serializer field
  for links such as "doctor's department" that only accepts objects of your own clinic.
- **Endpoints** under `/api/v1/`:

  | Endpoint        | Who may use it                                                  |
  | --------------- | --------------------------------------------------------------- |
  | `clinic/`       | GET: everyone. PATCH: clinic admin (name, address, PAN, receipt width, VAT). |
  | `departments/`  | GET: everyone. Create, edit, delete: clinic admin.              |
  | `staff/`        | Clinic admin only. Roles STAFF, PHARMACIST, LAB_TECHNICIAN.     |
  | `doctors/`      | GET: everyone. Create, edit, delete: clinic admin.              |
  | `patients/`     | Admin and staff: full CRUD. Doctor: read own patients only.     |

- **The tenant isolation test** (`apps/common/tests/test_tenant_isolation.py`).

### How tenant isolation works

1. The user's clinic is read from the database row of the logged-in user, which comes
   from the verified JWT. The client cannot change it.
2. No serializer has a `clinic` field, so a `clinic` value sent in a request body is
   ignored. A test sends clinic B's id and checks the row still lands in clinic A.
3. Detail URLs look the object up inside the already-filtered queryset. Another
   clinic's id is simply "not found", so the answer is **404**, not 403. A 403 would
   tell an attacker that the id exists.
4. Links to other objects (for now: a doctor's department) use
   `TenantPrimaryKeyRelatedField`, so another clinic's department id is rejected.
5. The isolation test runs for every tenant endpoint: log in as clinic A, check that
   clinic B's object is missing from the list and that GET, PATCH and DELETE on it
   return 404. Each later phase adds its endpoints to the `ENDPOINTS` list.

### Why it is built this way

- **One base class** means isolation is written once. A new endpoint is safe by
  inheriting it, and the test list makes a forgotten endpoint easy to spot.
- **Not in middleware**: DRF checks the JWT inside the view, after middleware has
  run, so middleware does not yet know who the user is.
- **`tenant_field`**: `DoctorProfile` has no clinic column of its own; its clinic is
  its user's clinic, so `DoctorViewSet` sets `tenant_field = "user__clinic"`.
- **A doctor is one flat JSON object** (email, name, fee, department...), although it
  is stored as two rows (`User` + `DoctorProfile`). `services.create_doctor()` makes
  both inside one transaction, so a failure never leaves half a doctor behind.
- **Users are never deleted.** `DELETE staff/<id>/` and `DELETE doctors/<id>/`
  deactivate the login (`is_active = False`) so history (who booked, who dispensed)
  stays intact. PATCH `is_active: true` brings them back.
- **Deleting a patient who has appointments returns 409**, not a server error. The
  database blocks it (`PROTECT`) and a small exception handler
  (`apps/common/exceptions.py`) turns that into a clear message.
- **`ReadOnly` permission** combines with role classes: `IsClinicAdmin | ReadOnly`
  means "everyone may look, only the admin may change".
- **Row-level rule for doctors**: `PatientViewSet.get_queryset()` narrows the list to
  patients who have an appointment with the logged-in doctor.

### Decisions to know about

- **Every role may read `clinic/`, `departments/` and `doctors/`.** Print pages need
  the clinic's details, and booking needs the doctor list.
- **The admin sets the first password of a new staff member or doctor**, and can set
  a new one with PATCH `password` (there is no email, so no reset link). Users change
  it themselves at `auth/change-password/`.
- **The clinic `slug` cannot be changed through the API.** It is the clinic's fixed
  identifier and is set by the super admin.
- **`?search=` is enabled** on departments, staff, doctors and patients (name, phone),
  because the patient and doctor pages need a search box.

### Files to read first

1. `backend/apps/common/views.py` - `TenantViewSet`, about 20 lines.
2. `backend/apps/common/tests/test_tenant_isolation.py` - the isolation test.
3. `backend/apps/common/serializers.py` - `TenantPrimaryKeyRelatedField`.
4. `backend/apps/accounts/views.py` - `StaffViewSet`, `DoctorViewSet`, `PatientViewSet`.
5. `backend/apps/accounts/serializers.py` - `DoctorSerializer` (one JSON object, two tables).
6. `backend/apps/accounts/services.py` - `create_doctor`, `update_doctor`, `deactivate_user`.
7. `backend/apps/clinics/views.py` - `ClinicView` and `DepartmentViewSet`.

## Decisions from the real clinic documents (taken after phase 3)

The real documents of a clinic in Nepalgunj (prescription pad, bill books, patient
register, lab report templates) were studied so that CliniSar works and prints like
the real thing. They stay outside Git because they contain real patient data. These
decisions change the brief and are built in the phase named in brackets.

### Chosen by you

1. **Visits: walk-in and booking** [phase 4]. The real register is a walk-in queue
   (date, no time). Staff can add a walk-in visit (today, next queue number, no time)
   or book a time slot as in the brief. Slot logic and the 409 on double booking stay.
2. **The lab is its own unit** [phases 5 and 7]. In the real clinic the lab is a
   separate business with its own PAN and bill book. Clinic settings get a lab name
   and lab PAN; LAB invoices and lab reports print those and use their own number
   sequence. Login, patients and doctors stay shared.
3. **VAT: on or off, and how much** [phase 5]. As in the brief, the admin switches
   VAT on or off per source and sets the rate (for example 5 or 13). The printed line
   is "VAT <rate>%", using the invoice's own rate.
4. **Lab order: several tests, doctor optional** [phase 7]. One order holds several
   tests, gets one Lab No. and one LAB bill with a line per test. It links to a visit
   when a doctor ordered it; otherwise lab staff create it and the report says
   "Consultant: Self".

### Needed to match the real documents

5. **Lab tests have parameters** [phase 7]. A real report is a panel: Hematology has
   15 rows (Hb, WBC, ...), each with result, unit and reference range, some under a
   sub-heading ("Differential Leucocyte Count"); Serology and Urine results are words
   ("Non-Reactive", "Nil"). So a lab test gets a list of parameters, and a completed
   order stores one result per parameter. A test can also have a method, specimen and
   an interpretation note, printed on the report.
6. **Patients** [phase 4]. The register records age, not date of birth, and often no
   phone. Staff can enter age or date of birth (age is stored as an estimated date of
   birth, so it stays correct next year); phone becomes optional.
7. **Doctor letterhead** [phase 4]. Real prescriptions carry the doctor's details at
   the top: qualifications ("M.B.B.S., M.S."), designation ("Consultant ENT
   Surgeon"), NMC number, and the name in Nepali. Doctors get these fields; the
   clinic gets its name and address in Nepali and a prescription validity note
   ("valid for 15 days").
8. **Printed formats** [phase 10]. Bills: S.N., Particular, Qty, Rate, Amount with
   Rs./Ps., amount in words (lakh and crore), "Issued by". Lab reports: patient info
   block, Lab No., collection and reporting dates, result table, `>>END OF REPORT<<`,
   signature lines. Printed dates are numeric BS, e.g. `2082/01/02`.

### Left out (ask if wanted)

- Medical certificates written by a doctor.
- Courier labels for samples sent to an outside lab.

## Phase 4 - Schedules, slots, appointments and walk-ins

### What was built

- **Endpoints** under `/api/v1/`:

  | Endpoint                          | What it does                                        |
  | --------------------------------- | --------------------------------------------------- |
  | `doctors/<id>/schedules/`         | CRUD a doctor's weekly working hours.               |
  | `GET doctors/<id>/slots/?date=`   | Free slots of that doctor on that day.              |
  | `appointments/`                   | List (with filters), create, retrieve.              |
  | `POST appointments/<id>/cancel/`  | Cancel with a reason (BOOKED only).                 |
  | `POST appointments/<id>/complete/`| Mark as seen (BOOKED only).                         |

- **Two kinds of visit** (`visit_type`):
  - `SCHEDULED`: a booked time slot (`date`, `start_time`, `end_time`).
  - `WALK_IN`: today, no time, a `queue_number` 1, 2, 3... per doctor per day.
- **Patients** can be registered by age (`age_years`) instead of date of birth, and
  phone is optional. Every patient response includes the current `age`.
- **Doctor letterhead fields**: `name_nepali`, `qualifications`, `designation`
  (NMC number is the existing `license_number`).
- **Clinic fields**: `name_nepali`, `address_nepali`, `prescription_note`.

### How slots are calculated (`apps/scheduling/services.py`)

Slots are never stored. For a doctor and a day:

1. Take the doctor's schedule blocks for that weekday (e.g. Monday 10:00-13:00).
2. Cut each block into `slot_minutes` pieces (10:00, 10:20, 10:40, ...). A leftover
   piece shorter than one slot is dropped.
3. Remove slots that already have a booking which is not cancelled.
4. Remove slots that have already started, in Nepal time.

### How booking stays safe

- Booking runs inside `transaction.atomic()`: check the slot is real and free, then
  insert.
- A slot that is not one of the doctor's slots, or is in the past: **400**.
- A slot that is already taken: **409**.
- If two receptionists book the same slot at the same moment, both may pass the
  check. The database's unique constraint on (doctor, date, start time) then lets
  only one insert through; the other gets an `IntegrityError`, which becomes a
  **409**. A test imitates this race.
- A cancelled booking does not block its slot (the constraint ignores CANCELLED).

### How the walk-in queue stays correct

`add_walk_in()` locks the doctor's row (`select_for_update`) while it picks
"highest number today + 1", so two receptionists can never both get number 3. A
unique constraint on (doctor, date, queue number) is the backstop. A cancelled
walk-in keeps its number, and numbers are not reused within the day.

### Who may do what

| Action                         | Admin | Staff | Doctor            | Pharmacist / Lab |
| ------------------------------ | ----- | ----- | ----------------- | ---------------- |
| Read schedules and slots       | yes   | yes   | yes               | no               |
| Change a schedule              | any   | no    | own only          | no               |
| List and view appointments     | all   | all   | own only          | no               |
| Book or add a walk-in          | yes   | yes   | no                | no               |
| Cancel or complete             | yes   | yes   | own only          | no               |

### Decisions to know about

- **Overlapping schedule blocks are refused** (e.g. 10:00-13:00 and 12:00-14:00 on
  the same day). Without this check the same slot could appear twice.
- **Cancelling needs a reason.**
- **Appointments cannot be edited or deleted directly** (405). They only change
  through `cancel/` and `complete/`, so the history stays honest.
- **`NO_SHOW`** exists as a status but has no endpoint yet, as in the brief.
- **Age entry** stores an estimated date of birth (today minus the age) and marks it
  with `date_of_birth_is_estimated`, so the printed age is still right next year.
- The appointment list supports `?date=`, `?date_from=`, `?date_to=`, `?doctor=`,
  `?patient=`, `?status=`, `?visit_type=` and `?search=` (patient name or phone).
- The consultation invoice on booking is added in phase 5.

### Manual check through the front-end dev server

Django and the Vite dev server were started together, and every call went to
`http://localhost:5173/api/...` (the Vite proxy), exactly as the browser will:

| Step                                           | Result                              |
| ---------------------------------------------- | ----------------------------------- |
| Vite serves the page                           | `<title>CliniSar</title>`           |
| Login                                          | 200, access token in body, refresh token only in an `HttpOnly; SameSite=Strict; Path=/api/v1/auth/` cookie |
| `auth/me/` with the Bearer token               | 200                                 |
| `auth/refresh/` with only the cookie           | 200, new access token               |
| Free slots for tomorrow                        | 200, 09:00, 09:20, ... |
| Book 09:20                                     | 201                                 |
| Book 09:20 again                               | **409**                             |
| Two walk-ins                                   | 201, queue numbers 1 and 2          |
| Cancel, then cancel again                      | 200, then 400                       |
| New patient by age, no phone                   | 201, age 30, estimated birth date   |
| Doctor: list / try to book                     | 200 (only own) / 403                |
| Logout, then refresh with the old cookie       | 204, then 401                       |
| Repeated wrong passwords                       | 401 until the 5-per-minute limit, then **429** |
| `/api/docs/` and `/admin/login/`               | 200                                 |

The local database `clinisar` keeps the made-up "Manual Check Clinic" (users
`admin@check.local`, `staff@check.local`, `doctor@check.local`).

### Files to read first

1. `backend/apps/scheduling/services.py` - slots, booking, walk-ins, cancel, complete.
2. `backend/apps/scheduling/models.py` - the three constraints on `Appointment`.
3. `backend/apps/scheduling/views.py` - thin views; `create` picks booking or walk-in.
4. `backend/apps/scheduling/serializers.py` - schedule overlap check, create input.
5. `backend/apps/scheduling/permissions.py` - who may change a schedule.
6. `backend/apps/scheduling/tests/test_slots.py` and `test_appointments_api.py`.
7. `backend/apps/accounts/serializers.py` - `PatientSerializer` (age entry).

## Phase 5 - Billing

### What was built

- **Invoice service** (`apps/billing/services.py`): one place for all money rules.
- **Endpoints**:

  | Endpoint                       | Who                                                       |
  | ------------------------------ | --------------------------------------------------------- |
  | `GET invoices/`, `invoices/<id>/` | Admin and staff: all. Pharmacist: PHARMACY only. Lab technician: LAB only. Doctor: no access. |
  | `POST invoices/<id>/pay/`      | Same roles, on the invoices they can see. Body: `payment_method`, optional `discount`. |
  | `POST invoices/<id>/cancel/`   | Admin and staff only. Body: `reason`.                     |

  There is no `POST invoices/`, PATCH or DELETE (405): invoices are made by the system.
- **Booking a visit or adding a walk-in creates a CONSULTATION invoice** at the
  doctor's fee, inside the same transaction. A failed booking (409) leaves no bill.
- **Cancelling a visit cancels its bill if it is UNPAID.** A PAID bill stays PAID.
- **Separate lab bill book**: clinic settings `lab_bills_separately`, `lab_name`,
  `lab_pan_number`.

### The invoice maths (`calculate_totals`)

```
subtotal   = sum of line totals            (line total = quantity x unit price)
taxable    = subtotal - discount           (discount must be 0 ... subtotal)
vat_amount = taxable x vat_rate / 100      rounded to paisa, 0.5 always up
total      = taxable + vat_amount
```

The same function runs when the invoice is created (discount 0) and again when it
is paid with a discount. The client never sends subtotal, VAT or total; extra fields
in the request are ignored. `Decimal` is used everywhere, never `float`.

Example: fee Rs. 700, VAT 13% -> VAT 91.00, total 791.00. Paid with Rs. 100
discount -> taxable 600.00, VAT 78.00, total 678.00.

### VAT

- The admin switches VAT on or off for each source (consultation, pharmacy, lab) and
  sets one rate (13, 5, ...).
- At creation the invoice copies `vat_rate` = the clinic rate if that source's switch
  is on, otherwise 0.
- Changing the settings later never changes existing invoices, because each invoice
  keeps its own rate.

### Invoice numbers

- `take_next_number()` locks the clinic row (`select_for_update`), adds 1 to the
  counter and uses it. Two invoices created at the same moment wait for each other,
  so numbers never repeat or skip.
- Each invoice has a `series`. Normally everything is in the CLINIC series (1, 2, 3
  ...). When `lab_bills_separately` is on, LAB invoices use the LAB series with their
  own counter, printed with the lab's name and PAN (as in the real clinic, where the
  lab is a separate business).
- The unique constraint (clinic, series, number) is the backstop.
- Each invoice also copies `issuer_name` and `issuer_pan`, so renaming the clinic or
  changing its PAN later does not change old bills.

### Two bugs the tests found (and the fixes)

1. **Saving clinic settings could roll back the invoice counter.** A settings screen
   saves a copy of the clinic read a moment earlier. If a bill was created in
   between, saving that copy wrote the old counter back, and the next bill number
   repeated. Fix: `Clinic.save()` never writes the two counters unless they are named
   in `update_fields`, which only the invoice service does.
2. **Cancelling a visit could crash if its bill had just been paid.** The status was
   checked before locking the row. Fix: lock first, then check.

### Decisions to know about

- **No `cancelled_by` on invoices** (the brief has none); the reason is stored.
- **The invoice list is ordered newest first** (`created_at`), because with two
  series the numbers alone do not give one order.
- **A doctor with fee 0 still gets a Rs. 0 invoice**, so every visit has a bill.
- **"Amount in words" and Rs./Ps. columns** are print-only and come in phase 10.

### Manual check through the front-end dev server

Run through `http://localhost:5173/api/...`:

| Step | Result |
| ---- | ------ |
| Admin turns VAT on for consultations at 13% | 200 |
| Staff books a visit with a Rs. 700 doctor | 201; bill created: 700.00 + VAT 91.00 = 791.00, UNPAID |
| Pay by card, discount 100, plus a fake `total` in the body | 200; VAT 78.00, total 678.00, PAID, cashier recorded |
| Pay again / cancel the paid bill | 400 / 400 |
| Cancel the visit of the paid bill | visit CANCELLED, bill stays PAID |
| Cancel another (unpaid) visit | its bill becomes CANCELLED with the reason |
| Pharmacist: list / open the consultation bill | 0 rows / 404 |
| Doctor opens invoices | 403 |
| `POST invoices/` | 405 |

### Files to read first

1. `backend/apps/billing/services.py` - top to bottom; every money rule is here.
2. `backend/apps/billing/models.py` - `Invoice` fields and constraints.
3. `backend/apps/billing/views.py` - roles and the row-level rule by source.
4. `backend/apps/clinics/models.py` - `Clinic.save()` and the counters.
5. `backend/apps/scheduling/services.py` - where booking calls the invoice service.
6. `backend/apps/billing/tests/test_services.py` - maths, VAT, numbering tests.
