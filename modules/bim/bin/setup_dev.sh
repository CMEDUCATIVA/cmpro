#!/bin/bash

set -euo pipefail

if ! command -v apt >/dev/null 2>&1; then
  echo "Needs debian/ubuntu system :-("
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Must be run as root user."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIM_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUNDLED_IFC_DIR="${BIM_ROOT}/vendor/ifcconvert/linux-amd64"
BUNDLED_IFC_BIN="${BUNDLED_IFC_DIR}/IfcConvert"

COLLADA2GLTF_URL="https://github.com/KhronosGroup/COLLADA2GLTF/releases/download/v2.1.5/COLLADA2GLTF-v2.1.5-linux.zip"
XEOKIT_METADATA_URL="https://github.com/bimspot/xeokit-metadata/releases/download/1.0.1/xeokit-metadata-linux-x64.tar.gz"
GLTF2XKT_NPM_VERSION="@xeokit/xeokit-gltf-to-xkt@1.3.1"
IFCOPENSHELL_PIP_VERSION="ifcopenshell==0.8.3.post2"

echo "[setup_dev] Installing OS dependencies..."
apt-get update -qq
apt-get install -y dotnet-runtime-6.0 wget unzip tar nodejs python3 python3-pip

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
cd "${tmpdir}"

echo "[setup_dev] Installing COLLADA2GLTF..."
wget --quiet "${COLLADA2GLTF_URL}"
unzip -q COLLADA2GLTF-v2.1.5-linux.zip
install -m 0755 COLLADA2GLTF-bin /usr/local/bin/COLLADA2GLTF

echo "[setup_dev] Validating bundled IfcConvert inside bim/vendor..."
if [[ ! -f "${BUNDLED_IFC_BIN}" ]]; then
  echo "ERROR: missing bundled IfcConvert at ${BUNDLED_IFC_BIN}"
  echo "Please place IfcConvert there before running setup."
  exit 1
fi
chmod 0755 "${BUNDLED_IFC_BIN}"

echo "[setup_dev] Installing xeokit-metadata..."
wget --quiet "${XEOKIT_METADATA_URL}"
tar -zxf xeokit-metadata-linux-x64.tar.gz
chmod +x xeokit-metadata-linux-x64/xeokit-metadata
cp -rT xeokit-metadata-linux-x64 /usr/lib/xeokit-metadata
rm -f /usr/local/bin/xeokit-metadata
ln -s /usr/lib/xeokit-metadata/xeokit-metadata /usr/local/bin/xeokit-metadata

echo "[setup_dev] Installing gltf2xkt..."
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm command is required to install gltf2xkt."
  exit 1
fi
npm install -g "${GLTF2XKT_NPM_VERSION}"

echo "[setup_dev] Installing IfcOpenShell Python package..."
python3 -m pip install --upgrade pip
python3 -m pip install "${IFCOPENSHELL_PIP_VERSION}"

echo
echo "[setup_dev] Verifying installed tools..."
command -v COLLADA2GLTF >/dev/null
echo "OK  COLLADA2GLTF (PATH): $(command -v COLLADA2GLTF)"
command -v xeokit-metadata >/dev/null
echo "OK  xeokit-metadata (PATH): $(command -v xeokit-metadata)"
command -v gltf2xkt >/dev/null
echo "OK  gltf2xkt (PATH): $(command -v gltf2xkt)"
python3 -c "import ifcopenshell; print('OK  ifcopenshell:', ifcopenshell.version)"

if [[ ! -x "${BUNDLED_IFC_BIN}" ]]; then
  echo "ERROR: bundled IfcConvert is not executable at ${BUNDLED_IFC_BIN}"
  exit 1
fi
echo "OK  bundled IfcConvert: ${BUNDLED_IFC_BIN}"

echo
echo "DONE"
