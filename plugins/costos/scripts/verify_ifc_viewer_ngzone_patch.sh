#!/usr/bin/env bash
set -euo pipefail

CORE_ROOT="${1:-/opt/openproject}"
TARGET_FILE="$CORE_ROOT/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts"

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "[costos] No existe el archivo objetivo: $TARGET_FILE" >&2
  exit 1
fi

fail=0

check() {
  local label="$1"
  local pattern="$2"

  if grep -qE "$pattern" "$TARGET_FILE"; then
    echo "[ok] $label"
  else
    echo "[fail] $label"
    fail=1
  fi
}

check_fixed() {
  local label="$1"
  local file="$2"
  local pattern="$3"

  if grep -qF "$pattern" "$file"; then
    echo "[ok] $label"
  else
    echo "[fail] $label"
    fail=1
  fi
}

check_absent() {
  local label="$1"
  local pattern="$2"

  if grep -qE "$pattern" "$TARGET_FILE"; then
    echo "[fail] $label"
    fail=1
  else
    echo "[ok] $label"
  fi
}

check "NgZone import" "import \{ Injectable, Injector, NgZone \} from '@angular/core';"
check "NgZone field injected" "@InjectField\(\) ngZone:NgZone;"
check_absent "constructor does not inject NgZone" "readonly ngZone:NgZone"
check "viewer outside angular" "this\.ngZone\.runOutsideAngular\(\(\) => \{"
check "core perf state hook" "__costosIfcViewerPerf"
check "core loadProject hook" "skip duplicate loadProject|loadProject', \{"
check "core loadBCFViewpoint hook" "skip duplicate loadBCFViewpoint|loadBCFViewpoint', \{"
check "core modelLoaded perf log" "\[IFC-PERF\]\[core\] modelLoaded"
check "core openInspector perf log" "\[IFC-PERF\]\[core\] openInspector"
check "core interaction process state hook" "__costosIfcViewerInteractionCore"
check "core interaction process event bridge" "costos:ifc-core-interaction-perf"
check "core interaction frame phase summary" "frame_phase_summary"
check "core interaction tick snapshot" "collectTickState|tickState"
check "core interaction process wrappers" "viewer\.pick|scene\.tickGap|raf\.gap|camera\.orbitYaw|cameraControl\.update|cameraFlight\.flyTo|scene\.compile|renderFrame|fireTickEvents|renderer\.render"
check "modelLoaded hook exists" "viewerUI\.on\('modelLoaded'"
check_fixed "modelLoaded updates viewerVisible" "$TARGET_FILE" "viewerVisible$.next(true)"
check_fixed "openInspector updates inspectorVisible" "$TARGET_FILE" "inspectorVisible$.next(true)"
check "ngZone.run exists" "this\.ngZone\.run\(\(\) => \{?|this\.ngZone\.run\(\(\) =>"
check "deleteModel hook still exists" "viewerUI\.on\('deleteModel'"
check "deleteModel re-enters zone" "this\.ngZone\.run\(\(\) => \{"

if [[ "$fail" -ne 0 ]]; then
  echo "[costos] Verificacion fallida."
  exit 1
fi

echo "[costos] Verificacion OK."
