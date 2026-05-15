#!/usr/bin/env bash
set -euo pipefail

IFC_VIEWER_CONTROLLER="/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb"
ATTACHMENT_MODEL="/opt/openproject/app/models/attachment.rb"
TYPINGS_FILE="/opt/openproject/frontend/src/typings/xeokit-sdk.d.ts"
CORE_FILE="/opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts"
API_ROOT="/opt/openproject/lib/api/root_api.rb"
IFC_PUBLIC_CONTROLLER="/opt/openproject/plugins/costos/app/controllers/costos/ifc_public_controller.rb"
PARTITIONED_QUERY_PAGE="/opt/openproject/frontend/src/app/features/work-packages/routing/partitioned-query-space-page/partitioned-query-space-page.component.ts"
IFC_VIEWER_PAGE="/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/ifc-viewer-page.component.ts"
BCF_VIEW_SERVICE="/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/bcf-view.service.ts"
BCF_LIST_COMPONENT="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/list/bcf-list.component.ts"
BCF_SPLIT_LEFT_TS="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.ts"
BCF_SPLIT_RIGHT_TS="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.ts"
BCF_SPLIT_LEFT_HTML="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.html"
BCF_SPLIT_RIGHT_HTML="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.html"
IFC_JS="/opt/openproject/plugins/costos/app/assets/javascripts/costos/ifc.js"
NGZONE_VERIFY_SCRIPT="/opt/openproject/plugins/costos/scripts/verify_ifc_viewer_ngzone_patch.sh"

echo "[costos] Verificando patch core..."

fail=0

check() {
  local label="$1"
  local file="$2"
  local pattern="$3"

  if grep -qE "$pattern" "$file"; then
    echo "[ok] $label"
  else
    echo "[fail] $label"
    fail=1
  fi
}

check "ifc_viewer_controller embed_request? bypass" "$IFC_VIEWER_CONTROLLER" "before_action :authorize, unless: :embed_request\\?"
check "ifc_viewer_controller embed_request? method" "$IFC_VIEWER_CONTROLLER" "def embed_request\\?"
check "ifc_viewer_controller public share bypass" "$IFC_VIEWER_CONTROLLER" "public_share_token_valid\\?"
check "ifc_viewer_controller public share login skip" "$IFC_VIEWER_CONTROLLER" "skip_before_action :require_login, if: :public_share_token_valid\\?"
check "ifc_viewer_controller public share project skip" "$IFC_VIEWER_CONTROLLER" "skip_before_action :find_project_by_project_id, if: :public_share_token_valid\\?"
check "attachment public_ifc_attachment? method" "$ATTACHMENT_MODEL" "def public_ifc_attachment\\?"
check "attachment visible? public bypass" "$ATTACHMENT_MODEL" "return true if public_ifc_attachment\\?"
check "xeokit typings" "$TYPINGS_FILE" "@xeokit/xeokit-sdk/dist/xeokit-sdk.es"
check "xeokit lights import" "$CORE_FILE" "DirLight, AmbientLight"
check "xeokit lights block" "$CORE_FILE" "scene.clearLights"
check "opXeokitViewer exposed" "$CORE_FILE" "opXeokitViewer"
check "api public share helper" "$API_ROOT" "def public_share_token_valid_for_api\\?"
check "api public share in authenticate" "$API_ROOT" "public_share_token_valid_for_api\\?"
check "api public share cookie" "$API_ROOT" "ifc_share_token"
check "ifc public cookie set" "$IFC_PUBLIC_CONTROLLER" "cookies\\[:ifc_share_token\\]"
check "public share skip query loading" "$PARTITIONED_QUERY_PAGE" "isIfcPublicShare"
check "public share bcf viewer only" "$BCF_VIEW_SERVICE" "isIfcPublicShare"
check "public share hide bcf toolbar" "$IFC_VIEWER_PAGE" "isIfcPublicShare"
check "public share bcf list guard" "$BCF_LIST_COMPONENT" "isIfcPublicShare"
check "public share ifc api guard" "$IFC_JS" "function shareToken\\(\\)|appendShareToken\\(url\\)"
check "public share split left helper" "$BCF_SPLIT_LEFT_TS" "isIfcPublicShare"
check "public share split right helper" "$BCF_SPLIT_RIGHT_TS" "isIfcPublicShare"
check "public share split left template guard" "$BCF_SPLIT_LEFT_HTML" "ifc_public_share_guard"
check "public share split right template guard" "$BCF_SPLIT_RIGHT_HTML" "ifc_public_share_guard"

if [ "$fail" -ne 0 ]; then
  echo "[costos] Verificacion fallida."
  exit 1
fi

if [[ -f "$NGZONE_VERIFY_SCRIPT" ]]; then
  bash "$NGZONE_VERIFY_SCRIPT" /opt/openproject
else
  echo "[fail] ngzone verify script missing"
  exit 1
fi

echo "[costos] Verificacion OK."
