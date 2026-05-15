#!/usr/bin/env bash
set -euo pipefail

SUDOERS_FILE="${1:-/etc/sudoers.d/openproject-costos-core-patch}"
OPENPROJECT_USER="${OPENPROJECT_USER:-openproject}"
APPLY_SCRIPT="${APPLY_SCRIPT:-/opt/openproject/plugins/costos/scripts/apply_core_patch.sh}"
VERIFY_SCRIPT="${VERIFY_SCRIPT:-/opt/openproject/plugins/costos/scripts/verify_core_patch.sh}"

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

cat >"$tmp_file" <<EOF
${OPENPROJECT_USER} ALL=(root) NOPASSWD: /bin/bash ${APPLY_SCRIPT}
${OPENPROJECT_USER} ALL=(root) NOPASSWD: /bin/bash ${VERIFY_SCRIPT}
EOF

install -m 0440 "$tmp_file" "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE"

echo "[costos] sudoers installed: $SUDOERS_FILE"
echo "[costos] openproject can now run core patch scripts with sudo -n"
