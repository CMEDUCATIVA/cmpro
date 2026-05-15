#!/usr/bin/env bash
set -euo pipefail

# Instala un binario IfcConvert dentro del plugin costos para evitar tocar /opt/openproject/bin.
# Uso:
#   ./scripts/install_ifcconvert_in_plugin.sh /ruta/al/IfcConvert
# Variables opcionales:
#   PLUGIN_DIR=/opt/openproject/plugins/costos
#   COSTOS_IFC_FLOW_LOG=/opt/openproject/log/costos_ifcconvert_flow.log

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 /ruta/al/IfcConvert" >&2
  exit 1
fi

SOURCE_BIN="$1"
PLUGIN_DIR="${PLUGIN_DIR:-/opt/openproject/plugins/costos}"
TARGET_DIR="$PLUGIN_DIR/bin"
TARGET_BIN="$TARGET_DIR/IfcConvert"
FLOW_LOG="${COSTOS_IFC_FLOW_LOG:-/opt/openproject/log/costos_ifcconvert_flow.log}"

log() {
  local msg="$1"
  local ts
  ts="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "[$ts] [install_ifcconvert] $msg" | tee -a "$FLOW_LOG"
}

run_with_optional_sudo() {
  # Ejecuta el comando directo; si falla por permisos y existe sudo sin password,
  # reintenta automaticamente con sudo -n.
  if "$@"; then
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    log "Reintentando con sudo -n: $*"
    sudo -n "$@"
    return $?
  fi

  return 1
}

if [[ ! -f "$SOURCE_BIN" ]]; then
  log "No existe archivo fuente: $SOURCE_BIN"
  exit 1
fi
if [[ ! -x "$SOURCE_BIN" ]]; then
  log "Advertencia: $SOURCE_BIN no es ejecutable. Intentando chmod +x automatico."
  run_with_optional_sudo chmod +x "$SOURCE_BIN" || \
    log "No se pudo aplicar chmod +x a fuente (se intentara igualmente instalar con modo 0755)."
fi

log "Inicio instalacion source=$SOURCE_BIN target=$TARGET_BIN"
run_with_optional_sudo mkdir -p "$TARGET_DIR"
run_with_optional_sudo install -m 0755 "$SOURCE_BIN" "$TARGET_BIN"

log "Instalado: $TARGET_BIN"
"$TARGET_BIN" --version 2>&1 | tee -a "$FLOW_LOG" || true
