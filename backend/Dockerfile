# Production image for the back end: Django served by Gunicorn.
# Built by CI on every push to main and stored in Amazon ECR; the EC2 server pulls it.
FROM python:3.14-slim

# Do not write .pyc files, print logs straight away (CloudWatch receives them as they
# happen), and use the production settings.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

# Dependencies first: this layer is reused while requirements.txt does not change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as an ordinary user, not root, so a bug in the app cannot change the container.
RUN useradd --system --no-create-home clinisar \
    && mkdir -p /app/staticfiles \
    && chown clinisar /app/staticfiles
USER clinisar

EXPOSE 8000

# 1. Copy the admin and API-docs CSS/JS into the volume nginx serves /static/ from.
# 2. Start Gunicorn: several Django worker processes, so one slow request does not
#    hold up everyone. Its own access log is off: RequestLogMiddleware already writes
#    one line per request, with the request id.
CMD ["sh", "-c", "python manage.py collectstatic --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 60"]
