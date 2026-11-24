<p><img src="docs/brand/clinisar-logo.png" alt="CliniSar" width="268"></p>

A multi-tenant clinic management system for clinics in Nepal. Many independent clinics
share one deployment, and each clinic only ever sees its own data. Clinic staff log in;
patients are records the staff manage.

**What a clinic can do with it**

- Register patients (age or date of birth, phone optional; one record per person).
- Book appointments from the doctors' weekly schedules, and run a walk-in queue.
- Doctors write prescriptions and order lab tests from the visit.
- Pharmacy: medicines in batches with expiry dates, dispensing earliest-expiring first,
  purchases, adjustments and write-offs, all kept in a stock history.
- Lab: tests with report rows, orders with sample and result steps, printed reports.
- Bills for consultations, medicines and lab tests, with optional VAT, separate number
  series for the clinic and the lab, A4 bills and thermal receipts.
- A "Today" dashboard per role, plus clinic figures and charts.
- Nepali dates (Bikram Sambat) and rupee amounts ("Rs. 1,25,000.00") throughout.

## Stack

| Part | Tools |
| ---- | ----- |
| Back end | Python 3.14, Django 5.2 LTS, Django REST Framework, JWT (simplejwt), PostgreSQL |
| Front end | React 19, TypeScript, Vite, Mantine, TanStack Query, React Hook Form + Zod |
| Tests | pytest + factory_boy, Vitest + Testing Library |
| Lint | Ruff; ESLint + Prettier |
| Production | Docker, Gunicorn, nginx, GitHub Actions, AWS (EC2, RDS, S3, CloudFront, ECR, CloudWatch) |

## Run it with Docker Compose

```bash
cp .env.example .env          # the defaults work for development
docker compose up --build
docker compose exec backend python manage.py seed_demo
```

- App: http://localhost:5173
- API docs: http://localhost:8000/api/docs/

## Run it without Docker

Needs Python 3.14, Node 26 and a local PostgreSQL with a database named `clinisar`.

```bash
# Back end
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export POSTGRES_USER=$(whoami)     # your local PostgreSQL user
python manage.py migrate
python manage.py seed_demo
python manage.py runserver

# Front end (second terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173, forwards /api to Django
```

## Demo logins

`seed_demo` creates two made-up clinics. Every password is **`demo-pass-123`**.

| Role | Sunrise Health Clinic (VAT on pharmacy) | Himal Care Clinic (no VAT) |
| ---- | --------------------------------------- | -------------------------- |
| Clinic admin | `admin@sunrise.demo` | `admin@himal.demo` |
| Front desk | `staff@sunrise.demo` | `staff@himal.demo` |
| Doctors | `dr.anil@`, `dr.sunita@`, `dr.bikash@sunrise.demo` | the same names `@himal.demo` |
| Pharmacist | `pharmacist@sunrise.demo` | `pharmacist@himal.demo` |
| Lab technician | `lab@sunrise.demo` | `lab@himal.demo` |

## Run the checks

```bash
# Back end (needs PostgreSQL)
cd backend
ruff check . && ruff format --check .
python manage.py makemigrations --check --dry-run
pytest

# Front end
cd frontend
npm run lint && npm run format:check && npm test && npm run build
```

The same checks run in GitHub Actions on every push. On `main` the workflow then
deploys (see below).

## Project layout

```
backend/      Django project: config/ (settings, urls) and apps/ (one folder per area)
frontend/     React app: src/api, components, features (one folder per area), print, routes, lib
deploy/       Production files for the server: docker-compose.prod.yml, nginx, deploy.sh
docs/         How it works, how it was built, how to deploy and test it
.github/      CI/CD workflow
```

## Documentation

| Document | Read it for |
| -------- | ----------- |
| [docs/OVERVIEW.md](docs/OVERVIEW.md) | The whole project on one page |
| [docs/BACKEND.md](docs/BACKEND.md) | How the API works: requests, tenancy, roles, rules, data model |
| [docs/FRONTEND.md](docs/FRONTEND.md) | How the app works: sessions, data loading, screens, design rules |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Setting up AWS by hand, releases, logs, rollback |
| [docs/MANUAL_TESTS.md](docs/MANUAL_TESTS.md) | The click-through checklist before a demo or release |
| [docs/PHASES.md](docs/PHASES.md) | What was built in each phase, and why |
| [docs/BRAND.md](docs/BRAND.md) | Logo, colours, type, and where each is used |

## Production in short

- The React app is static files in a private S3 bucket behind CloudFront
  (`app.<domain>`), with a strict Content-Security-Policy.
- The API runs in Docker on one EC2 server: nginx (HTTPS with Let's Encrypt, per-IP
  rate limits) in front of Django on Gunicorn (`api.<domain>`).
- PostgreSQL is Amazon RDS in a private subnet; uploaded files are in a private S3
  bucket, reached through 5-minute links.
- Secrets live in AWS Parameter Store; logs go to CloudWatch and can be searched by
  request id.
- A push to `main` runs the checks, then builds the back-end image (ECR), deploys it to
  EC2 (pull, migrate, restart) and publishes the front end (S3 + CloudFront).

Details: [docs/DEPLOY.md](docs/DEPLOY.md).
