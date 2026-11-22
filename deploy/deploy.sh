#!/usr/bin/env bash
# One release of the back end. Runs ON the EC2 server, started by the CI workflow
# through AWS Systems Manager (no SSH port is open):
#
#   /opt/clinisar/deploy.sh <full image name>
#   e.g. /opt/clinisar/deploy.sh 123456789012.dkr.ecr.ap-south-1.amazonaws.com/clinisar-backend:3f2a9c1
#
# Steps: secrets -> pull the new image -> migrate the database -> restart.
# If any step fails the script stops (set -e) and the old containers keep running.
set -euo pipefail

IMAGE="$1"
REGION=ap-south-1
cd /opt/clinisar

# 1. Settings and secrets from Parameter Store (/clinisar/production/NAME = value)
#    into .env, readable by root only. They are never in Git or in the image.
umask 077
aws ssm get-parameters-by-path --region "$REGION" --path /clinisar/production/ \
    --with-decryption --query 'Parameters[*].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do echo "${name##*/}=${value}"; done > .env.new
echo "BACKEND_IMAGE=${IMAGE}" >> .env.new
mv .env.new .env

compose() { docker compose -f docker-compose.prod.yml "$@"; }

# 2. Pull the new image from ECR (the instance's IAM role allows reading it).
aws ecr get-login-password --region "$REGION" |
    docker login --username AWS --password-stdin "${IMAGE%%/*}"
compose pull backend

# 3. Update the database BEFORE the new code serves requests. The old version keeps
#    serving meanwhile, so a migration must not break it (e.g. remove a column in a
#    later release than the one that stops using it).
compose run --rm backend python manage.py migrate --noinput
# The table the shared rate-limit counters live in (does nothing if it exists).
compose run --rm backend python manage.py createcachetable

# 4. Restart with the new image (only containers whose image or settings changed).
compose up -d --remove-orphans

# Keep the disk clean: remove images no container uses any more.
docker image prune -f
echo "Deployed ${IMAGE}"
