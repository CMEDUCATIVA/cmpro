#!/usr/bin/env bash
set -euo pipefail

# Compila IfcConvert desde fuentes de IfcOpenShell en Linux y lo instala en el plugin costos.
#
# Uso:
#   ./scripts/build_and_install_ifcconvert_for_plugin.sh [/ruta/IfcOpenShell]
#
# Flags opcionales:
#   --install-deps   Instala dependencias de Ubuntu via apt-get (requiere sudo/root)
#
# Variables opcionales:
#   IFCOPENSHELL_SRC_DIR=/ruta/IfcOpenShell
#   BUILD_DIR=/tmp/ifcopenshell-build
#   JOBS=<nproc>
#   PLUGIN_DIR=/opt/openproject/plugins/costos
#   COSTOS_IFC_FLOW_LOG=/opt/openproject/log/costos_ifcconvert_flow.log

if [[ $# -gt 2 ]]; then
  echo "Uso: $0 [/ruta/IfcOpenShell] [--install-deps]" >&2
  exit 1
fi

SRC_DIR="${1:-${IFCOPENSHELL_SRC_DIR:-}}"
FLAG="${2:-}"
if [[ -n "$SRC_DIR" && "$SRC_DIR" == "--install-deps" ]]; then
  FLAG="$SRC_DIR"
  SRC_DIR=""
fi
BUILD_DIR="${BUILD_DIR:-/tmp/ifcopenshell-build}"
JOBS="${JOBS:-$(nproc)}"
PLUGIN_DIR="${PLUGIN_DIR:-/opt/openproject/plugins/costos}"
FLOW_LOG="${COSTOS_IFC_FLOW_LOG:-/opt/openproject/log/costos_ifcconvert_flow.log}"

log() {
  local msg="$1"
  local ts
  ts="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "[$ts] [build_ifcconvert] $msg" | tee -a "$FLOW_LOG"
}

if [[ -z "$SRC_DIR" ]]; then
  for candidate in \
    "/opt/openproject/IfcOpenShell" \
    "/opt/IfcOpenShell" \
    "/usr/local/src/IfcOpenShell" \
    "$HOME/IfcOpenShell"; do
    if [[ -d "$candidate/cmake" ]]; then
      SRC_DIR="$candidate"
      break
    fi
  done
fi

if [[ ! -d "$SRC_DIR" ]]; then
  log "No existe directorio fuente: $SRC_DIR"
  exit 1
fi
if [[ ! -d "$SRC_DIR/cmake" ]]; then
  log "No parece un repo IfcOpenShell valido (falta carpeta cmake): $SRC_DIR"
  exit 1
fi
if [[ -n "$FLAG" && "$FLAG" != "--install-deps" ]]; then
  log "Flag no reconocido: $FLAG"
  exit 1
fi

log "Inicio build src=$SRC_DIR build=$BUILD_DIR jobs=$JOBS plugin_dir=$PLUGIN_DIR flag=${FLAG:-none}"

if [[ "$FLAG" == "--install-deps" ]]; then
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    SUDO="sudo"
  else
    SUDO=""
  fi

  log "Instalando dependencias via apt-get"
  $SUDO apt-get update 2>&1 | tee -a "$FLOW_LOG"
  $SUDO apt-get install -y \
    git cmake gcc g++ make pkg-config \
    libboost-all-dev libcgal-dev \
    libocct-data-exchange-dev libocct-draw-dev libocct-foundation-dev \
    libocct-modeling-algorithms-dev libocct-modeling-data-dev \
    libocct-ocaf-dev libocct-visualization-dev \
    libpcre3-dev libxml2-dev 2>&1 | tee -a "$FLOW_LOG"
fi

log "[1/3] Configurando build en: $BUILD_DIR"
cmake -S "$SRC_DIR/cmake" -B "$BUILD_DIR" -DCOLLADA_SUPPORT=On 2>&1 | tee -a "$FLOW_LOG"

log "[2/3] Compilando target IfcConvert con -j$JOBS"
cmake --build "$BUILD_DIR" --target IfcConvert -j "$JOBS" 2>&1 | tee -a "$FLOW_LOG"

log "[3/3] Buscando binario IfcConvert compilado"
BIN_PATH="$(find "$BUILD_DIR" -type f -name IfcConvert | head -n 1 || true)"
if [[ -z "$BIN_PATH" ]]; then
  log "No se encontro IfcConvert en $BUILD_DIR"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log "Binario compilado: $BIN_PATH"
PLUGIN_DIR="$PLUGIN_DIR" bash "$SCRIPT_DIR/install_ifcconvert_in_plugin.sh" "$BIN_PATH"

log "OK: IfcConvert instalado en $PLUGIN_DIR/bin/IfcConvert"
"$PLUGIN_DIR/bin/IfcConvert" --version 2>&1 | tee -a "$FLOW_LOG" || true
