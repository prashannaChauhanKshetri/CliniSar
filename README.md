# CliniSar

A multi-tenant clinic management system for clinics in Nepal. Many independent clinics
share one deployment, and each clinic only ever sees its own data.

This README is filled in fully in phase 11. Progress so far is described in
[docs/PHASES.md](docs/PHASES.md).

## Run with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

- Front end: http://localhost:5173
- API docs: http://localhost:8000/api/docs/

## Run the checks

```bash
# Back end (needs a running PostgreSQL)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check . && ruff format --check .
pytest

# Front end
cd frontend
npm install
npm run lint && npm run format:check && npm test && npm run build
```
