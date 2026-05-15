#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-${OPENPROJECT_CUSTOM_REPO_URL:-}}"
INSTALL_DIR="${2:-/opt/openproject-custom}"

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: $0 <github_repo_url> [install_dir]"
  echo "Example: $0 https://github.com/USER/openproject-custom.git /opt/openproject-custom"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose v2 is required."
  exit 1
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [[ ! -f deploy/.env ]]; then
  cp deploy/.env.example deploy/.env
  SECRET="$(openssl rand -hex 64 2>/dev/null || date +%s%N)"
  DB_PASSWORD="$(openssl rand -hex 24 2>/dev/null || date +%s%N)"
  sed -i "s/CHANGE_ME_generate_with_openssl_rand_hex_64/$SECRET/" deploy/.env
  sed -i "s/CHANGE_ME_database_password/$DB_PASSWORD/" deploy/.env
  echo "Created deploy/.env. Review OPENPROJECT_HOST before exposing the server."
fi

docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build

echo
echo "OpenProject custom is starting on http://localhost:8080"
echo "Use 'docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f web' to watch startup."

