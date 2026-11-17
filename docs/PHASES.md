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
