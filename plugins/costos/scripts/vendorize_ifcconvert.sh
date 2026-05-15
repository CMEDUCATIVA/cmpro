#!/usr/bin/env bash
set -euo pipefail

# Copy a compiled IfcConvert binary into plugin vendor path for portable deployments.
#
# Usage:
#   ./scripts/vendorize_ifcconvert.sh /path/to/IfcConvert

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/IfcConvert" >&2
  exit 1
fi

SRC_BIN="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/vendor/ifcconvert/linux-amd64"
TARGET_BIN="$TARGET_DIR/IfcConvert"

if [[ ! -f "$SRC_BIN" ]]; then
  echo "Source binary not found: $SRC_BIN" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
install -m 0755 "$SRC_BIN" "$TARGET_BIN"

echo "Bundled binary: $TARGET_BIN"
"$TARGET_BIN" --version || true
