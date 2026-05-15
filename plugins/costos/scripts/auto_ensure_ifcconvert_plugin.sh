#!/usr/bin/env bash
set -euo pipefail

# Script autonomo: asegura que exista IfcConvert dentro del plugin costos.
# Si falta o la version no coincide con el VERSION de las fuentes, recompila e instala.
#
# Uso:
#   ./scripts/auto_ensure_ifcconvert_plugin.sh
#
# Variables opcionales:
#   IFCOPENSHELL_SRC_DIR=/ruta/IfcOpenShell
#   PLUGIN_DIR=/opt/openproject/plugins/costos
#   AUTO_INSTALL_DEPS=1       # instala dependencias apt al compilar
#   COSTOS_IFC_FLOW_LOG=/opt/openproject/log/costos_ifcconvert_flow.log
#   IFCOPENSHELL_AUTO_CLONE=1 # si no encuentra fuentes, clona automaticamente
#   IFCOPENSHELL_CLONE_DIR=/opt/openproject/IfcOpenShell
#   IFCOPENSHELL_GIT_URL=https://github.com/IfcOpenShell/IfcOpenShell.git
#   BUNDLED_IFCCONVERT_PATH=/opt/openproject/plugins/costos/vendor/ifcconvert/linux-amd64/IfcConvert

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${PLUGIN_DIR:-/opt/openproject/plugins/costos}"
TARGET_BIN="$PLUGIN_DIR/bin/IfcConvert"
SRC_DIR="${IFCOPENSHELL_SRC_DIR:-}"
AUTO_INSTALL_DEPS="${AUTO_INSTALL_DEPS:-0}"
FLOW_LOG="${COSTOS_IFC_FLOW_LOG:-/opt/openproject/log/costos_ifcconvert_flow.log}"
AUTO_CLONE="${IFCOPENSHELL_AUTO_CLONE:-1}"
CLONE_DIR="${IFCOPENSHELL_CLONE_DIR:-/opt/openproject/IfcOpenShell}"
GIT_URL="${IFCOPENSHELL_GIT_URL:-https://github.com/IfcOpenShell/IfcOpenShell.git}"
BUNDLED_BIN="${BUNDLED_IFCCONVERT_PATH:-$PLUGIN_DIR/vendor/ifcconvert/linux-amd64/IfcConvert}"

log() {
  local msg="$1"
  local ts
  ts="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "[$ts] [auto_ensure_ifcconvert] $msg" | tee -a "$FLOW_LOG" >&2
}

discover_src_dir() {
  local candidate
  for candidate in \
    "$SRC_DIR" \
    "/opt/openproject/IfcOpenShell" \
    "/opt/IfcOpenShell" \
    "/usr/local/src/IfcOpenShell" \
    "$HOME/IfcOpenShell"; do
    [[ -n "${candidate:-}" ]] || continue
    if [[ -d "$candidate/cmake" && -f "$candidate/VERSION" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_source_repo() {
  local source_dir
  source_dir="$(discover_src_dir || true)"
  if [[ -n "$source_dir" ]]; then
    echo "$source_dir"
    return 0
  fi

  if [[ "$AUTO_CLONE" != "1" ]]; then
    return 1
  fi

  log "No se encontraron fuentes locales. Clonando IfcOpenShell en $CLONE_DIR"
  if [[ -d "$CLONE_DIR/.git" ]]; then
    git -C "$CLONE_DIR" fetch --all --tags 2>&1 | tee -a "$FLOW_LOG"
    git -C "$CLONE_DIR" submodule update --init --recursive 2>&1 | tee -a "$FLOW_LOG"
  else
    mkdir -p "$(dirname "$CLONE_DIR")"
    git clone --recursive "$GIT_URL" "$CLONE_DIR" 2>&1 | tee -a "$FLOW_LOG"
  fi

  if [[ -d "$CLONE_DIR/cmake" && -f "$CLONE_DIR/VERSION" ]]; then
    echo "$CLONE_DIR"
    return 0
  fi

  return 1
}

extract_target_version() {
  local source_dir="$1"
  tr -d ' \t\r\n' < "$source_dir/VERSION"
}

extract_installed_version() {
  local bin="$1"
  "$bin" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true
}

main() {
  local source_dir target_version installed_version build_flag bundled_version
  source_dir="$(discover_src_dir || true)"
  bundled_version=""
  if [[ -f "$BUNDLED_BIN" ]]; then
    chmod +x "$BUNDLED_BIN" 2>/dev/null || true
  fi

  if [[ -x "$BUNDLED_BIN" ]]; then
    bundled_version="$(extract_installed_version "$BUNDLED_BIN")"
  fi

  if [[ -n "$source_dir" ]]; then
    target_version="$(extract_target_version "$source_dir")"
  else
    target_version="${bundled_version:-unknown}"
  fi

  log "Inicio auto ensure source_dir=${source_dir:-none} bundled_bin=$BUNDLED_BIN target_bin=$TARGET_BIN"
  installed_version=""
  if [[ -x "$TARGET_BIN" ]]; then
    installed_version="$(extract_installed_version "$TARGET_BIN")"
  fi

  if [[ -x "$TARGET_BIN" && -n "$installed_version" && "$installed_version" == "$target_version" ]]; then
    log "IfcConvert ya esta actualizado en plugin: $installed_version"
    exit 0
  fi

  log "Actualizando IfcConvert del plugin (instalado='${installed_version:-none}' objetivo='$target_version')"

  if [[ -f "$BUNDLED_BIN" ]]; then
    chmod +x "$BUNDLED_BIN" 2>/dev/null || true
  fi

  if [[ -x "$BUNDLED_BIN" ]]; then
    log "Usando binario empaquetado del plugin: $BUNDLED_BIN"
    # Intentamos copiar a plugins/costos/bin por compatibilidad. Si no hay permisos,
    # seguimos sin fallar porque el plugin puede usar el binario empaquetado directamente.
    if bash "$SCRIPT_DIR/install_ifcconvert_in_plugin.sh" "$BUNDLED_BIN"; then
      installed_version="$(extract_installed_version "$TARGET_BIN")"
      log "IfcConvert instalado desde binario empaquetado, version detectada: ${installed_version:-desconocida}"
    else
      log "No se pudo copiar a $TARGET_BIN (permisos). Se usara binario empaquetado directamente."
      bundled_version="$(extract_installed_version "$BUNDLED_BIN")"
      log "IfcConvert empaquetado listo, version detectada: ${bundled_version:-desconocida}"
    fi
    exit 0
  fi

  source_dir="${source_dir:-$(ensure_source_repo || true)}"
  if [[ -z "$source_dir" ]]; then
    log "No se encontro IfcOpenShell ni binario empaquetado. Define IFCOPENSHELL_SRC_DIR o incluye vendor/ifcconvert/linux-amd64/IfcConvert."
    exit 1
  fi

  build_flag=""
  if [[ "$AUTO_INSTALL_DEPS" == "1" ]]; then
    build_flag="--install-deps"
  fi

  if [[ -n "$build_flag" ]]; then
    bash "$SCRIPT_DIR/build_and_install_ifcconvert_for_plugin.sh" "$source_dir" "$build_flag"
  else
    bash "$SCRIPT_DIR/build_and_install_ifcconvert_for_plugin.sh" "$source_dir"
  fi

  installed_version="$(extract_installed_version "$TARGET_BIN")"
  log "IfcConvert instalado en plugin, version detectada: ${installed_version:-desconocida}"
}

main "$@"
