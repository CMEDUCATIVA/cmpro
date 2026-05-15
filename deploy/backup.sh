#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f deploy/.env ]]; then
  echo "deploy/.env does not exist. Copy deploy/.env.example first."
  exit 1
fi

set -a
source deploy/.env
set +a

BACKUP_DIR="${1:-$ROOT_DIR/backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$BACKUP_DIR"

docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-openproject}" -d "${POSTGRES_DB:-openproject}" \
  > "$BACKUP_DIR/database.sql"

docker run --rm \
  -v "${COMPOSE_PROJECT_NAME:-openproject_custom}_opdata:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  busybox tar czf /backup/opdata.tar.gz -C /data .

cp deploy/.env "$BACKUP_DIR/env.copy"

echo "Backup written to $BACKUP_DIR"
