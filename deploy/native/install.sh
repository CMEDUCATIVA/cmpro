#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-${OPENPROJECT_CUSTOM_REPO_URL:-}}"
INSTALL_DIR="${2:-/opt/openproject-custom}"
APP_USER="${APP_USER:-openproject}"
APP_NAME="${APP_NAME:-openproject-custom}"
ENV_DIR="/etc/${APP_NAME}"
ENV_FILE="${ENV_DIR}/openproject.env"
DATA_DIR="${APP_DATA_PATH:-/var/${APP_NAME}/assets}"
NODE_VERSION="${NODE_VERSION:-22.15.0}"
POSTGRES_VERSION="${POSTGRES_VERSION:-13}"
OPENPROJECT_BASE_VERSION="${OPENPROJECT_BASE_VERSION:-16.1.1}"
POSTGRES_CURRENT_MINOR="${POSTGRES_CURRENT_MINOR:-13.21}"
DB_NAME="${POSTGRES_DB:-openproject}"
DB_USER="${POSTGRES_USER:-openproject}"
DB_PASSWORD_FILE="/root/.${APP_NAME}.db_password"
CONFIGURED_HOST="${OPENPROJECT_HOST_NAME:-${OPENPROJECT_HOST__NAME:-}}"
CONFIGURED_HTTPS="${OPENPROJECT_HTTPS:-}"
CONFIGURED_BIND_HOST="${HOST:-}"
CONFIGURED_PORT="${PORT:-}"
ADMIN_LOGIN="${OPENPROJECT_ADMIN_LOGIN:-admin}"
ADMIN_PASSWORD="${OPENPROJECT_ADMIN_PASSWORD:-admin}"
ADMIN_MAIL="${OPENPROJECT_ADMIN_MAIL:-admin@example.com}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0 <github_repo_url> [install_dir]"
  exit 1
fi

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: sudo $0 <github_repo_url> [install_dir]"
  echo "Example: sudo $0 https://github.com/USER/openproject-custom.git /opt/openproject-custom"
  exit 1
fi

if ! grep -qiE "debian|ubuntu" /etc/os-release; then
  echo "This installer currently targets Debian/Ubuntu servers."
  exit 1
fi

prompt_configuration() {
  local input

  if [[ -z "$CONFIGURED_HOST" ]]; then
    read -r -p "Dominio para OpenProject, sin https:// [localhost]: " input
    CONFIGURED_HOST="${input:-localhost}"
  fi

  if [[ -z "$CONFIGURED_HTTPS" ]]; then
    read -r -p "Usara HTTPS externo con Nginx/Proxy? [y/N]: " input
    case "$input" in
      y|Y|yes|YES|s|S|si|SI) CONFIGURED_HTTPS=true ;;
      *) CONFIGURED_HTTPS=false ;;
    esac
  fi

  if [[ -z "$CONFIGURED_BIND_HOST" ]]; then
    read -r -p "IP donde escuchara Puma [0.0.0.0]: " input
    CONFIGURED_BIND_HOST="${input:-0.0.0.0}"
  fi

  if [[ -z "$CONFIGURED_PORT" ]]; then
    read -r -p "Puerto interno de Puma [8080]: " input
    CONFIGURED_PORT="${input:-8080}"
  fi
}

arch() {
  case "$(uname -m)" in
    aarch64|arm64) echo "arm64" ;;
    *) echo "x64" ;;
  esac
}

run_as_app() {
  sudo -u "$APP_USER" env \
    PATH="$INSTALL_DIR/vendor/ruby-3.4.4/bin:/usr/local/bin:/usr/bin:/bin" \
    BUNDLE_WITHOUT="development:test" \
    "$@"
}

install_packages() {
  local codename
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"

  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --batch --yes --dearmor -o /etc/apt/keyrings/postgresql.gpg
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list

  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates curl file git gnupg2 build-essential pkg-config \
    libpq-dev libpq5 libffi-dev libyaml-dev libssl-dev zlib1g-dev \
    unrtf tesseract-ocr poppler-utils catdoc imagemagick libclang-dev \
    libjemalloc2 nginx "postgresql-${POSTGRES_VERSION}" "postgresql-client-${POSTGRES_VERSION}"
}

install_node() {
  if command -v node >/dev/null 2>&1 && node --version | grep -q "v${NODE_VERSION}"; then
    return
  fi

  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-$(arch).tar.gz" \
    | tar xzf - -C /usr/local --strip-components=1
}

prepare_user_and_dirs() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd -m -d "/home/${APP_USER}" -s /bin/bash "$APP_USER"
  fi

  mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$ENV_DIR"
  chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR" "$DATA_DIR"
  chmod 750 "$ENV_DIR"
}

fetch_code() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    run_as_app git -C "$INSTALL_DIR" pull --ff-only
  else
    if [[ -d "$INSTALL_DIR" ]] && find "$INSTALL_DIR" -mindepth 1 -print -quit | grep -q .; then
      echo "$INSTALL_DIR exists and is not a Git repository. Move it first or choose another directory."
      exit 1
    fi

    git clone "$REPO_URL" "$INSTALL_DIR"
    chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
  fi
}

write_env() {
  local secret db_password escaped_db_url

  if [[ -f "$ENV_FILE" ]]; then
    echo "Keeping existing $ENV_FILE"
    return
  fi

  secret="$(openssl rand -hex 64)"
  db_password="$(openssl rand -hex 24)"

  cp "$INSTALL_DIR/deploy/native/.env.example" "$ENV_FILE"
  sed -i "s|APP_USER=openproject|APP_USER=${APP_USER}|g" "$ENV_FILE"
  sed -i "s|APP_PATH=/opt/openproject-custom|APP_PATH=${INSTALL_DIR}|g" "$ENV_FILE"
  sed -i "s|APP_DATA_PATH=/var/openproject-custom/assets|APP_DATA_PATH=${DATA_DIR}|g" "$ENV_FILE"
  sed -i "s|HOST=127.0.0.1|HOST=${CONFIGURED_BIND_HOST}|g" "$ENV_FILE"
  sed -i "s|PORT=8080|PORT=${CONFIGURED_PORT}|g" "$ENV_FILE"
  sed -i "s|OPENPROJECT_BASE_VERSION=16.1.1|OPENPROJECT_BASE_VERSION=${OPENPROJECT_BASE_VERSION}|g" "$ENV_FILE"
  sed -i "s|POSTGRES_VERSION=13|POSTGRES_VERSION=${POSTGRES_VERSION}|g" "$ENV_FILE"
  sed -i "s|POSTGRES_CURRENT_MINOR=13.21|POSTGRES_CURRENT_MINOR=${POSTGRES_CURRENT_MINOR}|g" "$ENV_FILE"
  sed -i "s|OPENPROJECT_ATTACHMENTS__STORAGE__PATH=/var/openproject-custom/assets/files|OPENPROJECT_ATTACHMENTS__STORAGE__PATH=${DATA_DIR}/files|g" "$ENV_FILE"
  sed -i "s|OPENPROJECT_HOST__NAME=localhost|OPENPROJECT_HOST__NAME=${CONFIGURED_HOST}|g" "$ENV_FILE"
  sed -i "s|OPENPROJECT_HTTPS=false|OPENPROJECT_HTTPS=${CONFIGURED_HTTPS}|g" "$ENV_FILE"
  sed -i "s|CHANGE_ME_generate_with_openssl_rand_hex_64|${secret}|g" "$ENV_FILE"
  sed -i "s|CHANGE_ME_database_password|${db_password}|g" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"

  printf "%s" "$db_password" > "$DB_PASSWORD_FILE"
  chmod 600 "$DB_PASSWORD_FILE"
}

setup_database() {
  local db_password

  systemctl enable --now postgresql

  if [[ -f "$DB_PASSWORD_FILE" ]]; then
    db_password="$(cat "$DB_PASSWORD_FILE")"
  else
    db_password="$(grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's|^DATABASE_URL=postgres://[^:]+:([^@]+)@.*$|\1|')"
  fi

  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${db_password}';"

  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

  rm -f "$DB_PASSWORD_FILE"
}

install_ruby_dependencies() {
  cd "$INSTALL_DIR"

  if [[ -f vendor/ruby-3.4.4/lib/libruby-static.a.gz ]]; then
    gzip -dkf vendor/ruby-3.4.4/lib/libruby-static.a.gz
    chown "$APP_USER:$APP_USER" vendor/ruby-3.4.4/lib/libruby-static.a
  fi

  if [[ ! -f vendor/ruby-3.4.4/lib/libruby-static.a ]]; then
    echo "Missing vendor/ruby-3.4.4/lib/libruby-static.a; native gem builds cannot continue."
    exit 1
  fi

  run_as_app "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" config set --local path vendor/bundle
  run_as_app "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" config set --local without "development test"
  run_as_app "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" install --jobs=8 --retry=3
}

setup_app() {
  cd "$INSTALL_DIR"
  cp -f config/database.production.yml config/database.yml
  mkdir -p tmp log "$DATA_DIR/files"
  chown -R "$APP_USER:$APP_USER" tmp log "$DATA_DIR"

  run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" exec rake db:migrate
  ensure_admin_user
  run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) npm install
  run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" exec rails openproject:plugins:register_frontend assets:precompile
}

ensure_admin_user() {
  run_as_app env $(grep -v '^#' "$ENV_FILE" | xargs) \
    OPENPROJECT_ADMIN_LOGIN="$ADMIN_LOGIN" \
    OPENPROJECT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    OPENPROJECT_ADMIN_MAIL="$ADMIN_MAIL" \
    "$INSTALL_DIR/vendor/ruby-3.4.4/bin/bundle" exec rails runner '
      login = ENV.fetch("OPENPROJECT_ADMIN_LOGIN")
      password = ENV.fetch("OPENPROJECT_ADMIN_PASSWORD")
      mail = ENV.fetch("OPENPROJECT_ADMIN_MAIL")

      user = User.find_by(login: login) || User.new(login: login)
      user.firstname = "Admin"
      user.lastname = "User"
      user.mail = mail
      user.admin = true
      user.status = User.statuses[:active]
      user.force_password_change = false if user.respond_to?(:force_password_change=)
      user.password = password
      user.password_confirmation = password
      user.save!(validate: false)

      puts "Admin ready: #{login} / #{password}"
    '
}

install_services() {
  sed "s|/opt/openproject-custom|${INSTALL_DIR}|g; s|User=openproject|User=${APP_USER}|g; s|Group=openproject|Group=${APP_USER}|g; s|/etc/openproject-custom/openproject.env|${ENV_FILE}|g" \
    "$INSTALL_DIR/deploy/native/openproject-web.service" > "/etc/systemd/system/${APP_NAME}-web.service"

  sed "s|/opt/openproject-custom|${INSTALL_DIR}|g; s|User=openproject|User=${APP_USER}|g; s|Group=openproject|Group=${APP_USER}|g; s|/etc/openproject-custom/openproject.env|${ENV_FILE}|g; s|openproject-custom-web.service|${APP_NAME}-web.service|g" \
    "$INSTALL_DIR/deploy/native/openproject-worker.service" > "/etc/systemd/system/${APP_NAME}-worker.service"

  systemctl daemon-reload
  systemctl enable --now "${APP_NAME}-web.service" "${APP_NAME}-worker.service"
}

install_wrapper() {
  install -m 0755 "$INSTALL_DIR/deploy/native/openproject-wrapper" /usr/local/bin/openproject
}

prompt_configuration
install_packages
install_node
prepare_user_and_dirs
fetch_code
write_env
setup_database
install_ruby_dependencies
setup_app
install_services
install_wrapper

echo
echo "Installed ${APP_NAME} at ${INSTALL_DIR}"
echo "OpenProject base version: ${OPENPROJECT_BASE_VERSION}"
echo "PostgreSQL major version: ${POSTGRES_VERSION} (current source server: ${POSTGRES_CURRENT_MINOR})"
echo "Environment: ${ENV_FILE}"
echo "Configured host: ${CONFIGURED_HOST}"
echo "Internal bind: ${CONFIGURED_BIND_HOST}:${CONFIGURED_PORT}"
echo "CLI wrapper: /usr/local/bin/openproject"
echo "Edit ${ENV_FILE}, then run: systemctl restart ${APP_NAME}-web ${APP_NAME}-worker"
