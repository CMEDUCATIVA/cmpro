#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-openproject-custom}"
APP_USER="${APP_USER:-openproject}"
INSTALL_DIR="${1:-/opt/openproject-custom}"
ENV_FILE="/etc/${APP_NAME}/openproject.env"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0 [install_dir]"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

run_as_app() {
  sudo -u "$APP_USER" env \
    PATH="$INSTALL_DIR/vendor/ruby-3.4.4/bin:/usr/local/bin:/usr/bin:/bin" \
    BUNDLE_WITHOUT="development:test" \
    "$@"
}

cd "$INSTALL_DIR"

run_as_app git pull --ff-only
run_as_app "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" install --jobs=8 --retry=3
run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" exec rake db:migrate
run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) npm install
run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" exec rails openproject:plugins:register_frontend assets:precompile

systemctl restart "${APP_NAME}-web.service" "${APP_NAME}-worker.service"

echo "Updated ${APP_NAME}."

