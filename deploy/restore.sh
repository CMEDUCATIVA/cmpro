#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${1:-}"

if [[ ! -f "$ROOT_DIR/deploy/.env" ]]; then
  echo "deploy/.env does not exist. Copy deploy/.env.example first."
  exit 1
fi

if [[ -z "$BACKUP_DIR" || ! -f "$BACKUP_DIR/database.sql" || ! -f "$BACKUP_DIR/opdata.tar.gz" ]]; then
  echo "Usage: $0 <backup_dir>"
  echo "backup_dir must contain database.sql and opdata.tar.gz"
  exit 1
fi

cd "$ROOT_DIR"

set -a
source deploy/.env
set +a

docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d db cache

docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T db \
  psql -U "${POSTGRES_USER:-openproject}" -d "${POSTGRES_DB:-openproject}" \
  < "$BACKUP_DIR/database.sql"

docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-openproject_custom}_opdata:/data" \
  -v "$BACKUP_DIR:/backup:ro" \
  busybox sh -c "rm -rf /data/* && tar xzf /backup/opdata.tar.gz -C /data"

docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build

echo "Restore complete."
