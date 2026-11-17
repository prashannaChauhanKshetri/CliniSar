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
