#!/usr/bin/env bash
set -euo pipefail

CORE_FILE="/opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts"
TYPINGS_FILE="/opt/openproject/frontend/src/typings/xeokit-sdk.d.ts"
IFC_VIEWER_CONTROLLER="/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb"
ATTACHMENT_MODEL="/opt/openproject/app/models/attachment.rb"
API_ROOT="/opt/openproject/lib/api/root_api.rb"
IFC_PUBLIC_CONTROLLER="/opt/openproject/plugins/costos/app/controllers/costos/ifc_public_controller.rb"
PARTITIONED_QUERY_PAGE="/opt/openproject/frontend/src/app/features/work-packages/routing/partitioned-query-space-page/partitioned-query-space-page.component.ts"
IFC_VIEWER_PAGE="/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/ifc-viewer-page.component.ts"
BCF_VIEW_SERVICE="/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/bcf-view.service.ts"
BCF_LIST_COMPONENT="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/list/bcf-list.component.ts"
BCF_SPLIT_LEFT_HTML="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.html"
BCF_SPLIT_RIGHT_HTML="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.html"
BCF_SPLIT_LEFT_TS="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.ts"
BCF_SPLIT_RIGHT_TS="/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.ts"
IFC_JS="/opt/openproject/plugins/costos/app/assets/javascripts/costos/ifc.js"
ASSETS_INITIALIZER="/opt/openproject/config/initializers/assets.rb"

echo "[costos] Applying core patch to enable xeokit lights (no shadows)"

# Add typings if missing
if ! grep -q "@xeokit/xeokit-sdk/dist/xeokit-sdk.es" "$TYPINGS_FILE" 2>/dev/null; then
  echo "declare module '@xeokit/xeokit-sdk/dist/xeokit-sdk.es';" | tee "$TYPINGS_FILE" >/dev/null
  echo "[costos] Added typings: $TYPINGS_FILE"
fi

# Add import if missing
if ! grep -q "DirLight, AmbientLight" "$CORE_FILE"; then
  sed -i "/xeokit-bim-viewer.es/a import { DirLight, AmbientLight } from '@xeokit/xeokit-sdk/dist/xeokit-sdk.es';" "$CORE_FILE"
  echo "[costos] Added DirLight/AmbientLight import"
fi

# Insert light block if missing
if ! grep -q "scene.clearLights()" "$CORE_FILE"; then
  sed -i "/const viewerUI = new BIMViewer/a\\
    const scene = (viewerUI as any).viewer.scene;\\
\\
    // Reemplazar luces por defecto\\
    scene.clearLights();\\
\\
    new AmbientLight(scene, {\\
      id: \"ambientLight\",\\
      color: [1, 1, 1],\\
      intensity: 0.35,\\
    });\\
\\
    new DirLight(scene, {\\
      id: \"sunLight\",\\
      dir: [-0.6, -1.0, -0.4],\\
      color: [1, 1, 1],\\
      intensity: 1.0,\\
      space: \"view\",\\
      castsShadow: false,\\
    });\\
" "$CORE_FILE"
  echo "[costos] Added light block (shadows disabled)"
fi

# Expose viewer on window if missing
if ! grep -q "opXeokitViewer" "$CORE_FILE"; then
  sed -i "/const viewerUI = new BIMViewer/a\\
    (window as any).opXeokitViewer = viewerUI;\\
" "$CORE_FILE"
  echo "[costos] Exposed viewer on window (opXeokitViewer)"
fi

echo "[costos] Core patch done"

echo "[costos] Applying core patch for public IFC embed"

# Allow IFC viewer to render for embed links without auth
if ! grep -q "embed_request?" "$IFC_VIEWER_CONTROLLER"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
text = path.read_text()
text = text.replace("before_action :authorize\n", "before_action :authorize, unless: :embed_request?\n")
if "def embed_request?" not in text:
    text = text.replace(
        "  private\n",
        "  private\n\n"
        "    def embed_request?\n"
        "      value = params[:embed].to_s\n"
        "      value == \"true\" || value == \"1\"\n"
        "    end\n"
    )
path.write_text(text)
PY
  echo "[costos] Added embed_request? bypass in ifc_viewer_controller"
fi

# Allow IFC viewer access when a valid public share token is provided
if ! grep -q "public_share_token_valid?" "$IFC_VIEWER_CONTROLLER"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
text = path.read_text()

if "skip_before_action :authorize, if: :public_share_token_valid?" not in text:
    text = text.replace(
        "before_action :set_default_models\n",
        "before_action :set_default_models\n"
        "      skip_before_action :authorize, if: :public_share_token_valid?\n"
    )

if "def public_share_token_valid?" not in text:
      text = text.replace(
          "  private\n",
          "  private\n\n"
          "    def public_share_token_valid?\n"
          "      token = params[:share_token].to_s\n"
          "      Rails.logger.info(\"[IFC_PUBLIC] share_token_check token=#{token.to_s[0, 8]} models=#{params[:models].to_s[0, 120]} embed=#{params[:embed].to_s}\")\n"
          "      return false if token.empty?\n"
        "\n"
        "      model = ::Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)\n"
        "      return false unless model\n"
        "\n"
        "      @project ||= model.project\n"
        "\n"
        "      ids = []\n"
        "      if params[:models]\n"
        "        begin\n"
        "          ids = JSON.parse(params[:models])\n"
        "        rescue StandardError\n"
        "          ids = []\n"
        "        end\n"
        "      end\n"
        "      ids = Array(ids).map { |val| val.to_i }\n"
        "      ids.empty? || ids.include?(model.id)\n"
        "    end\n"
    )

path.write_text(text)
PY
  echo "[costos] Added public share token bypass in ifc_viewer_controller"
else
  python3 - <<'PY'
from pathlib import Path
import re

path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
text = path.read_text()

pattern = re.compile(r"def public_share_token_valid\\?[\\s\\S]*?\\n\\s*end\\n", re.M)
replacement = (
    "    def public_share_token_valid?\\n"
    "      token = params[:share_token].to_s\\n"
    "      Rails.logger.info(\\\"[IFC_PUBLIC] share_token_check token=#{token.to_s[0, 8]} models=#{params[:models].to_s[0, 120]} embed=#{params[:embed].to_s}\\\")\\n"
    "      return false if token.empty?\\n"
    "\\n"
    "      model = ::Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)\\n"
    "      return false unless model\\n"
    "\\n"
    "      @project ||= model.project\\n"
    "\\n"
    "      ids = []\\n"
    "      if params[:models]\\n"
    "        begin\\n"
    "          ids = JSON.parse(params[:models])\\n"
    "        rescue StandardError\\n"
    "          ids = []\\n"
    "        end\\n"
    "      end\\n"
    "      ids = Array(ids).map { |val| val.to_i }\\n"
    "      ids.empty? || ids.include?(model.id)\\n"
    "    end\\n"
)

new_text, count = pattern.subn(replacement, text)
if count == 0:
    print("[costos] public_share_token_valid? not found for update")
else:
    path.write_text(new_text)
PY
  echo "[costos] Updated public share token validation"
fi

# Ensure public share validation does not depend on @project from params
if grep -q "public_share_token_valid?" "$IFC_VIEWER_CONTROLLER"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
lines = path.read_text().splitlines(True)

filtered = []
for line in lines:
    if "model.project_id == @project.id" in line:
        continue
    filtered.append(line)

text = "".join(filtered)

needle = "return false unless model\n"
if "@project ||= model.project" not in text and needle in text:
    text = text.replace(needle, needle + "      @project ||= model.project\n")

path.write_text(text)
PY
  echo "[costos] Normalized public share token validation (no project param dependency)"
fi

# Skip login / project visibility requirements for public share token
if ! grep -q "skip_before_action :require_login, if: :public_share_token_valid?" "$IFC_VIEWER_CONTROLLER"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
text = path.read_text()

insert_after = "before_action :parse_showing_models\n"
skip_block = (
    "      skip_before_action :require_login, if: :public_share_token_valid?, raise: false\n"
    "      skip_before_action :check_if_login_required, if: :public_share_token_valid?, raise: false\n"
)

if insert_after in text and "skip_before_action :require_login, if: :public_share_token_valid?" not in text:
    text = text.replace(insert_after, insert_after + skip_block)
    path.write_text(text)
PY
  echo "[costos] Added skip require_login/project lookup for public share token"
fi

# Ensure project lookup is skipped for public share token
if ! grep -q "skip_before_action :find_project_by_project_id, if: :public_share_token_valid?" "$IFC_VIEWER_CONTROLLER"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
text = path.read_text()

insert_after = "before_action :parse_showing_models\n"
skip_line = "      skip_before_action :find_project_by_project_id, if: :public_share_token_valid?, raise: false\n"

if insert_after in text and "skip_before_action :find_project_by_project_id, if: :public_share_token_valid?" not in text:
    text = text.replace(insert_after, insert_after + skip_line)
    path.write_text(text)
PY
  echo "[costos] Added skip find_project_by_project_id for public share token"
fi

# Allow public access to IFC/XKT/metadata attachments for embed links
if ! grep -q "public_ifc_attachment?" "$ATTACHMENT_MODEL"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/app/models/attachment.rb")
text = path.read_text()
target = """  def visible?(user = User.current)
    allowed_or_author?(user) do
      container.attachments_visible?(user)
    end
  end
"""
replacement = """  def visible?(user = User.current)
    return true if public_ifc_attachment?(user)

    allowed_or_author?(user) do
      container.attachments_visible?(user)
    end
  end

  def public_ifc_attachment?(user)
    return false unless user.nil? || (user.respond_to?(:anonymous?) && user.anonymous?)
    return false unless container_type == "Bim::IfcModels::IfcModel"
    return false unless container.respond_to?(:public_share_enabled?) && container.public_share_enabled?

    desc = description.to_s
    return true if desc == "ifc" || desc == "xkt" || desc == "ifc_meta_ifcopenshell"

    filename = file.to_s.downcase
    return false if filename.empty?

    filename.end_with?(".ifc") || filename.end_with?(".xkt") || filename.end_with?("model_ifcopenshell.json")
  end
"""
if target not in text:
    raise SystemExit("Expected Attachment#visible? block not found")
text = text.replace(target, replacement)
path.write_text(text)
PY
  echo "[costos] Added public_ifc_attachment? visibility override"
fi

echo "[costos] Core patch for public IFC embed done"

echo "[costos] Applying core patch for API public IFC share"

# Allow API access for public IFC share token (avoid 401 for share links)
if ! grep -q "public_share_token_valid_for_api\\?" "$API_ROOT"; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/lib/api/root_api.rb")
text = path.read_text()

helpers_marker = "module Helpers\n"
if helpers_marker not in text:
    raise SystemExit("Helpers module not found in API root")

insert = (
    "      def public_share_token_valid_for_api?\n"
    "        token = params[:share_token].to_s\n"
    "        if token.empty?\n"
    "          token = request.cookies[\"ifc_share_token\"].to_s\n"
    "        end\n"
    "        if token.empty?\n"
    "          ref = env[\"HTTP_REFERER\"].to_s\n"
    "          if ref.include?(\"share_token=\")\n"
    "            token = ref.split(\"share_token=\").last.split(/[&#]/).first.to_s\n"
    "            token = Rack::Utils.unescape(token) if token\n"
    "          end\n"
    "        end\n"
    "        return false if token.to_s.empty?\n"
    "\n"
    "        model = ::Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)\n"
    "        return false unless model\n"
    "\n"
    "        ids = []\n"
    "        if params[:models]\n"
    "          begin\n"
    "            ids = JSON.parse(params[:models])\n"
    "          rescue StandardError\n"
    "            ids = []\n"
    "          end\n"
    "        end\n"
    "        ids = Array(ids).map { |val| val.to_i }\n"
    "        ids.empty? || ids.include?(model.id)\n"
    "      end\n\n"
)

if "def public_share_token_valid_for_api?" not in text:
    text = text.replace(helpers_marker, helpers_marker + insert)

text = text.replace(
    "      def authenticate\n"
    "        User.current = warden.authenticate! scope: authentication_scope\n"
    "\n"
    "        if Setting.login_required? && !logged_in? && !allowed_unauthenticated_route?\n"
    "          raise ::API::Errors::Unauthenticated\n"
    "        end\n"
    "      end\n",
    "      def authenticate\n"
    "        if public_share_token_valid_for_api?\n"
    "          User.current = User.anonymous\n"
    "          return\n"
    "        end\n"
    "\n"
    "        User.current = warden.authenticate! scope: authentication_scope\n"
    "\n"
    "        if Setting.login_required? && !logged_in? && !allowed_unauthenticated_route?\n"
    "          raise ::API::Errors::Unauthenticated\n"
    "        end\n"
    "      end\n"
)

text = text.replace(
    "      def allowed_unauthenticated_route?\n"
    "        false\n"
    "      end\n",
    "      def allowed_unauthenticated_route?\n"
    "        public_share_token_valid_for_api? || false\n"
    "      end\n"
)

path.write_text(text)
PY
  echo "[costos] Added API public share token bypass"
fi

# Ensure API public share helper logs token source
if grep -q "public_share_token_valid_for_api\\?" "$API_ROOT"; then
  python3 - <<'PY'
from pathlib import Path
import re

path = Path("/opt/openproject/lib/api/root_api.rb")
text = path.read_text()

pattern = re.compile(r"def public_share_token_valid_for_api\\?[\\s\\S]*?\\n\\s*end\\n", re.M)
replacement = (
    "      def public_share_token_valid_for_api?\\n"
    "        token = params[:share_token].to_s\\n"
    "        source = \"param\"\\n"
    "        if token.empty?\\n"
    "          token = request.cookies[\\\"ifc_share_token\\\"].to_s\\n"
    "          source = \"cookie\"\\n"
    "        end\\n"
    "        if token.empty?\\n"
    "          ref = env[\\\"HTTP_REFERER\\\"].to_s\\n"
    "          if ref.include?(\\\"share_token=\\\")\\n"
    "            token = ref.split(\\\"share_token=\\\").last.split(/[&#]/).first.to_s\\n"
    "            token = Rack::Utils.unescape(token) if token\\n"
    "            source = \"referer\"\\n"
    "          end\\n"
    "        end\\n"
    "        token = token.to_s\\n"
    "        Rails.logger.info(\\\"[IFC_PUBLIC][API] share_token_source=#{source} token=#{token[0,8]}\\\")\\n"
    "        return false if token.empty?\\n"
    "\\n"
    "        model = ::Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)\\n"
    "        Rails.logger.info(\\\"[IFC_PUBLIC][API] token_valid=#{!!model}\\\")\\n"
    "        return false unless model\\n"
    "\\n"
    "        ids = []\\n"
    "        if params[:models]\\n"
    "          begin\\n"
    "            ids = JSON.parse(params[:models])\\n"
    "          rescue StandardError\\n"
    "            ids = []\\n"
    "          end\\n"
    "        end\\n"
    "        ids = Array(ids).map { |val| val.to_i }\\n"
    "        ids.empty? || ids.include?(model.id)\\n"
    "      end\\n"
)

new_text, count = pattern.subn(replacement, text)
if count > 0:
    path.write_text(new_text)
PY
  echo "[costos] Updated API public share helper logging"
fi

# Force API helper to include cookie/referrer handling + logging
python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/lib/api/root_api.rb")
text = path.read_text()

replacement = (
    "      def public_share_token_valid_for_api?\n"
    "        token = params[:share_token].to_s\n"
    "        source = \"param\"\n"
    "        if token.empty?\n"
    "          token = request.cookies[\"ifc_share_token\"].to_s\n"
    "          source = \"cookie\"\n"
    "        end\n"
    "        if token.empty?\n"
    "          ref = env[\"HTTP_REFERER\"].to_s\n"
    "          if ref.include?(\"share_token=\")\n"
    "            token = ref.split(\"share_token=\").last.split(/[&#]/).first.to_s\n"
    "            token = Rack::Utils.unescape(token) if token\n"
    "            source = \"referer\"\n"
    "          end\n"
    "        end\n"
    "        token = token.to_s\n"
    "        Rails.logger.info(\"[IFC_PUBLIC][API] share_token_source=#{source} token=#{token[0,8]}\")\n"
    "        return false if token.empty?\n"
    "\n"
    "        model = ::Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)\n"
    "        Rails.logger.info(\"[IFC_PUBLIC][API] token_valid=#{!!model}\")\n"
    "        return false unless model\n"
    "\n"
    "        ids = []\n"
    "        if params[:models]\n"
    "          begin\n"
    "            ids = JSON.parse(params[:models])\n"
    "          rescue StandardError\n"
    "            ids = []\n"
    "          end\n"
    "        end\n"
    "        ids = Array(ids).map { |val| val.to_i }\n"
    "        ids.empty? || ids.include?(model.id)\n"
    "      end\n"
)

marker = "module Helpers\n"
if marker not in text:
    raise SystemExit("Helpers module not found in API root")

start = text.find("def public_share_token_valid_for_api?")
if start != -1:
    indent = "      "
    end_marker = "\n" + indent + "end"
    end_idx = text.find(end_marker, start)
    if end_idx != -1:
        end_idx = end_idx + len(end_marker)
        text = text[:start] + replacement + text[end_idx:]
    else:
        text = text.replace(marker, marker + replacement + "\n")
else:
    text = text.replace(marker, marker + replacement + "\n")

path.write_text(text)
PY
echo "[costos] Forced API public share helper update"

echo "[costos] Core patch for API public IFC share done"

echo "[costos] Applying patch for public IFC cookie"

if ! grep -q "ifc_share_token" "$IFC_PUBLIC_CONTROLLER" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/plugins/costos/app/controllers/costos/ifc_public_controller.rb")
text = path.read_text()

marker = 'return render status: :not_found, plain: "Not Found" unless model\n\n'
cookie_block = (
    "      cookies[:ifc_share_token] = {\n"
    "        value: model.public_share_token,\n"
    "        path: \"/\",\n"
    "        same_site: :lax,\n"
    "        secure: request.ssl?,\n"
    "        expires: 2.hours.from_now\n"
    "      }\n\n"
)

if marker in text and "cookies[:ifc_share_token]" not in text:
    text = text.replace(marker, marker + cookie_block)
    path.write_text(text)
PY
  echo "[costos] Added ifc_share_token cookie on public share"
fi

echo "[costos] Core patch for public IFC cookie done"

echo "[costos] Ensuring costos assets are precompiled"
if ! grep -q "costos/ifc.js" "$ASSETS_INITIALIZER" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/config/initializers/assets.rb")
text = path.read_text()

block = "\nRails.application.config.assets.precompile += %w[\n  costos/ifc.js\n  costos/xeokit_config.js\n]\n"

if "costos/ifc.js" not in text:
    text += block
    path.write_text(text)
PY
  echo "[costos] Added costos assets to precompile list"
fi

echo "[costos] Applying frontend public IFC share patch"

# Skip query loading for public IFC share links to avoid /api/v3/queries/default
if ! grep -q "isIfcPublicShare" "$PARTITIONED_QUERY_PAGE" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/work-packages/routing/partitioned-query-space-page/partitioned-query-space-page.component.ts")
text = path.read_text()

helper = (
    "  protected isIfcPublicShare():boolean {\n"
    "    try {\n"
    "      if (!window || !window.location) return false;\n"
    "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\n"
    "      const params = new URLSearchParams(window.location.search || '');\n"
    "      return params.has('share_token');\n"
    "    } catch (e) {\n"
    "      return false;\n"
    "    }\n"
    "  }\n\n"
)

if "isIfcPublicShare" not in text:
    text = text.replace("  protected inviteModal = InviteUserModalComponent;\n\n", "  protected inviteModal = InviteUserModalComponent;\n\n" + helper)

needle = "    // Load the query. If it hasn't been loaded before, do that visibly.\n    this.loadInitialQuery();\n"
if needle in text:
    replace = (
        "    if (this.isIfcPublicShare()) {\n"
        "      this.showToolbar = false;\n"
        "      this.filterAllowed = false;\n"
        "      this.currentPartition = '-right-only';\n"
        "      this.cdRef.detectChanges();\n"
        "      return;\n"
        "    }\n\n"
        "    // Load the query. If it hasn't been loaded before, do that visibly.\n"
        "    this.loadInitialQuery();\n"
    )
    text = text.replace(needle, replace)

path.write_text(text)
PY
  echo "[costos] Added public share skip query loading"
fi

# Ensure public share guard runs before WorkPackagesViewBase initialization
python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/work-packages/routing/partitioned-query-space-page/partitioned-query-space-page.component.ts")
text = path.read_text()

needle = "  ngOnInit():void {\n    super.ngOnInit();\n"
if needle in text:
    replace = (
        "  ngOnInit():void {\n"
        "    if (this.isIfcPublicShare()) {\n"
        "      this.showToolbar = false;\n"
        "      this.filterAllowed = false;\n"
        "      this.currentPartition = '-right-only';\n"
        "      this.cdRef.detectChanges();\n"
        "      return;\n"
        "    }\n"
        "    super.ngOnInit();\n"
    )
    text = text.replace(needle, replace)

path.write_text(text)
PY
echo "[costos] Guarded ngOnInit for public share"

# Force viewer-only mode in public share for BCF view service
if ! grep -q "isIfcPublicShare" "$BCF_VIEW_SERVICE" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/bcf-view.service.ts")
text = path.read_text()

helper = (
    "  private isIfcPublicShare():boolean {\n"
    "    try {\n"
    "      if (!window || !window.location) return false;\n"
    "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\n"
    "      const params = new URLSearchParams(window.location.search || '');\n"
    "      return params.has('share_token');\n"
    "    } catch (e) {\n"
    "      return false;\n"
    "    }\n"
    "  }\n\n"
)

if "isIfcPublicShare" not in text:
    text = text.replace("  constructor(\n", helper + "  constructor(\n")

needle = "  public valueFromQuery(query:QueryResource):BcfViewState|undefined {\n    const dr = query.displayRepresentation;\n\n    switch (dr) {\n"
if needle in text:
    replace = (
        "  public valueFromQuery(query:QueryResource):BcfViewState|undefined {\n"
        "    if (this.isIfcPublicShare()) {\n"
        "      return 'viewer';\n"
        "    }\n"
        "    const dr = query.displayRepresentation;\n\n"
        "    switch (dr) {\n"
    )
    text = text.replace(needle, replace)

path.write_text(text)
PY
  echo "[costos] Forced viewer-only state for public share"
fi

# Hide BCF toolbar actions when in public share
if ! grep -q "isIfcPublicShare" "$IFC_VIEWER_PAGE" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/ifc-viewer-page.component.ts")
text = path.read_text()

helper = (
    "  protected isIfcPublicShare():boolean {\n"
    "    try {\n"
    "      if (!window || !window.location) return false;\n"
    "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\n"
    "      const params = new URLSearchParams(window.location.search || '');\n"
    "      return params.has('share_token');\n"
    "    } catch (e) {\n"
    "      return false;\n"
    "    }\n"
    "  }\n\n"
)

if "isIfcPublicShare" not in text:
    text = text.replace("  text = {\n", helper + "  text = {\n")

replacements = {
    "show: ():boolean => !this.viewerBridgeService.shouldShowViewer,": "show: ():boolean => !this.viewerBridgeService.shouldShowViewer && !this.isIfcPublicShare(),",
    "show: ():boolean => this.ifcData.allowed('manage_bcf'),": "show: ():boolean => !this.isIfcPublicShare() && this.ifcData.allowed('manage_bcf'),",
    "show: ():boolean => this.bcfView.currentViewerState() !== 'viewer',": "show: ():boolean => !this.isIfcPublicShare() && this.bcfView.currentViewerState() !== 'viewer',",
}

for old, new in replacements.items():
    text = text.replace(old, new)

# Hide toggle + zen mode + settings when public
text = text.replace(
    "      component: BcfViewToggleButtonComponent,\n      containerClasses: 'hidden-for-tablet',\n    },",
    "      component: BcfViewToggleButtonComponent,\n      containerClasses: 'hidden-for-tablet',\n      show: ():boolean => !this.isIfcPublicShare(),\n    },"
)
text = text.replace(
    "      component: ZenModeButtonComponent,\n      containerClasses: 'hidden-for-tablet',\n    },",
    "      component: ZenModeButtonComponent,\n      containerClasses: 'hidden-for-tablet',\n      show: ():boolean => !this.isIfcPublicShare(),\n    },"
)
text = text.replace(
    "      component: WorkPackageSettingsButtonComponent,\n      containerClasses: 'hidden-for-tablet',\n      show: ():boolean => this.authorisationService.can('query', 'updateImmediately'),\n",
    "      component: WorkPackageSettingsButtonComponent,\n      containerClasses: 'hidden-for-tablet',\n      show: ():boolean => !this.isIfcPublicShare() && this.authorisationService.can('query', 'updateImmediately'),\n"
)

path.write_text(text)
PY
  echo "[costos] Hid BCF toolbar actions for public share"
fi

# Ensure helper is protected (TS inheritance)
python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/ifc-viewer-page.component.ts")
text = path.read_text()
text = text.replace("  private isIfcPublicShare():boolean {", "  protected isIfcPublicShare():boolean {")
path.write_text(text)
PY
echo "[costos] Ensured isIfcPublicShare is protected in IFC viewer page"

echo "[costos] Frontend public IFC share patch done"

echo "[costos] Applying public share guards for BCF list + IFC API calls"

# Skip BCF list initialization in public share mode
if ! grep -q "isIfcPublicShare" "$BCF_LIST_COMPONENT" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/list/bcf-list.component.ts")
text = path.read_text()

helper = (
    "  private isIfcPublicShare():boolean {\n"
    "    try {\n"
    "      if (!window || !window.location) return false;\n"
    "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\n"
    "      const params = new URLSearchParams(window.location.search || '');\n"
    "      return params.has('share_token');\n"
    "    } catch (e) {\n"
    "      return false;\n"
    "    }\n"
    "  }\n\n"
)

if "isIfcPublicShare" not in text:
    text = text.replace("  public showViewPointInFlight:boolean;\n\n", "  public showViewPointInFlight:boolean;\n\n" + helper)

needle = "  ngOnInit():void {\n    super.ngOnInit();\n  }\n"
if needle in text:
    text = text.replace(
        needle,
        "  ngOnInit():void {\n    if (this.isIfcPublicShare()) {\n      return;\n    }\n    super.ngOnInit();\n  }\n"
    )

path.write_text(text)
PY
  echo "[costos] Skipped BCF list init for public share"
fi

# Avoid calling /api/v3/ifc_models when share_token is present
if grep -q "function fetchModelIdFromApi" "$IFC_JS" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/plugins/costos/app/assets/javascripts/costos/ifc.js")
text = path.read_text()

if "if (shareToken()) return done(null);" not in text:
    text = text.replace(
        "  function fetchModelIdFromApi(projectId, done) {\n    if (!projectId) return done(null);\n",
        "  function fetchModelIdFromApi(projectId, done) {\n    if (!projectId) return done(null);\n    if (isEmbedRequest()) return done(null);\n    if (shareToken()) return done(null);\n"
    )

if "if (shareToken()) return;" not in text:
    text = text.replace(
        "  function loadParallelMetadataWithId(modelId) {\n    if (!modelId) return;\n",
        "  function loadParallelMetadataWithId(modelId) {\n    if (!modelId) return;\n    if (shareToken()) return;\n"
    )

path.write_text(text)
PY
  echo "[costos] Disabled IFC model API calls for public share"
fi

echo "[costos] Public share guards applied"

echo "[costos] Applying public share guards for BCF split templates"

# Add public share helper to split components
if ! grep -q "isIfcPublicShare" "$BCF_SPLIT_LEFT_TS" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path
import re

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.ts")
text = path.read_text()

helper = (
    "  public isIfcPublicShare():boolean {\\n"
    "    try {\\n"
    "      if (!window || !window.location) return false;\\n"
    "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\\n"
    "      const params = new URLSearchParams(window.location.search || '');\\n"
    "      return params.has('share_token');\\n"
    "    } catch (e) {\\n"
    "      return false;\\n"
    "    }\\n"
    "  }\\n\\n"
)

if "isIfcPublicShare" not in text:
    # Prefer inserting before ngOnInit
    marker = "  ngOnInit():void {\\n"
    if marker in text:
        text = text.replace(marker, helper + marker)
    else:
        # Fallback: insert after class declaration
        text = re.sub(r"(export class BcfSplitLeftComponent implements OnInit \\{\\n)", r"\\1" + helper, text, count=1)

    path.write_text(text)
PY
  echo "[costos] Added isIfcPublicShare to BCF split left component"
fi

if ! grep -q "isIfcPublicShare" "$BCF_SPLIT_RIGHT_TS" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path
import re

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.ts")
text = path.read_text()

helper = (
    "  public isIfcPublicShare():boolean {\\n"
    "    try {\\n"
    "      if (!window || !window.location) return false;\\n"
    "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\\n"
    "      const params = new URLSearchParams(window.location.search || '');\\n"
    "      return params.has('share_token');\\n"
    "    } catch (e) {\\n"
    "      return false;\\n"
    "    }\\n"
    "  }\\n\\n"
)

if "isIfcPublicShare" not in text:
    marker = "  ngOnInit():void {\\n"
    if marker in text:
        text = text.replace(marker, helper + marker)
    else:
        text = re.sub(r"(export class BcfSplitRightComponent implements OnInit \\{\\n)", r"\\1" + helper, text, count=1)

    path.write_text(text)
PY
  echo "[costos] Added isIfcPublicShare to BCF split right component"
fi

# Avoid mounting BCF list in public share (prevents /queries/default + /ifc_models)
if ! grep -q "ifc_public_share_guard" "$BCF_SPLIT_LEFT_HTML" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.html")
text = path.read_text()

# Angular v16+ control flow (@if) or legacy *ngIf
if "<op-bcf-list />" in text:
    guarded = (
        "@if ((showViewer$ | async) === false && !isIfcPublicShare()) {\\n"
        "  <op-bcf-list />\\n"
        "}\\n"
        "@if ((showViewer$ | async) === false && isIfcPublicShare()) {\\n"
        "  <!-- ifc_public_share_guard: hide BCF list in public share -->\\n"
        "}\\n"
    )
    text = text.replace("<op-bcf-list />", guarded)
elif "*ngIf=\"(showViewer$ | async) === false\"" in text:
    text = text.replace(
        "*ngIf=\"(showViewer$ | async) === false\"",
        "*ngIf=\"(showViewer$ | async) === false && !isIfcPublicShare()\""
    )
    if "ifc_public_share_guard" not in text:
        text += "\\n<!-- ifc_public_share_guard: hide BCF list in public share -->\\n"

path.write_text(text)
PY
  echo "[costos] Guarded BCF split left list for public share"
fi

if ! grep -q "ifc_public_share_guard" "$BCF_SPLIT_RIGHT_HTML" 2>/dev/null; then
  python3 - <<'PY'
from pathlib import Path

path = Path("/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.html")
text = path.read_text()

if "@if (showWorkPackages$ | async) {" in text:
    text = text.replace(
        "@if (showWorkPackages$ | async) {",
        "@if ((showWorkPackages$ | async) && !isIfcPublicShare()) {"
    )
    if "ifc_public_share_guard" not in text:
        text = text.replace(
            "@if ((showWorkPackages$ | async) && !isIfcPublicShare()) {",
            "@if ((showWorkPackages$ | async) && !isIfcPublicShare()) {\\n"
            "  <!-- ifc_public_share_guard: hide BCF list in public share -->"
        )
elif "*ngIf=\"showWorkPackages$ | async\"" in text:
    text = text.replace(
        "*ngIf=\"showWorkPackages$ | async\"",
        "*ngIf=\"(showWorkPackages$ | async) && !isIfcPublicShare()\""
    )
    if "ifc_public_share_guard" not in text:
        text += "\\n<!-- ifc_public_share_guard: hide BCF list in public share -->\\n"

path.write_text(text)
PY
  echo "[costos] Guarded BCF split right list for public share"
fi

echo "[costos] BCF split template guards applied"

echo "[costos] Normalizing public share detection (cookie + param)"

# Ensure isIfcPublicShare checks cookie as well
python3 - <<'PY'
from pathlib import Path
import re

files = [
    "/opt/openproject/frontend/src/app/features/work-packages/routing/partitioned-query-space-page/partitioned-query-space-page.component.ts",
    "/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/bcf-view.service.ts",
    "/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/ifc-viewer-page.component.ts",
    "/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/list/bcf-list.component.ts",
    "/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.ts",
    "/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.ts",
]

replacement_body = (
    "  isIfcPublicShare():boolean {\n"
    "    try {\n"
      "      if (!window || !window.location) return false;\n"
      "      if (window.location.pathname.indexOf('/bcf') === -1) return false;\n"
      "      const params = new URLSearchParams(window.location.search || '');\n"
      "      if (params.has('share_token')) return true;\n"
      "      const href = String(window.location.href || '');\n"
      "      if (href.indexOf('share_token=') !== -1) return true;\n"
    "      return false;\n"
    "    } catch (e) {\n"
      "      return false;\n"
    "    }\n"
    "  }"
)

def normalize(text, path):
    if "isIfcPublicShare" not in text:
        return text

    # BCF view service sometimes accumulates extra catch blocks; replace until constructor
    if path.endswith("/bcf-view.service.ts"):
        pattern = re.compile(r"\s*(private|protected|public)?\s+isIfcPublicShare\(\):boolean\s*\{[\s\S]*?\n\s*constructor\(", re.M)
        replacement = (
            "  private" + replacement_body.replace("  isIfcPublicShare", " isIfcPublicShare") + "\n\n"
            "  constructor("
        )
        new_text, count = pattern.subn(replacement, text)
        if count:
            return new_text

    # Partitioned query page sometimes accumulates extra catch blocks; replace until loadQuery
    if path.endswith("/partitioned-query-space-page.component.ts"):
        pattern = re.compile(r"\s*(private|protected|public)?\s+isIfcPublicShare\(\):boolean\s*\{[\s\S]*?\n\s*protected loadQuery\(", re.M)
        replacement = (
            "  protected" + replacement_body.replace("  isIfcPublicShare", " isIfcPublicShare") + "\n\n"
            "  protected loadQuery("
        )
        new_text, count = pattern.subn(replacement, text)
        if count:
            return new_text

    # BCF list sometimes accumulates extra catch blocks; replace until ngOnInit
    if path.endswith("/bcf/list/bcf-list.component.ts"):
        pattern = re.compile(r"\s*(private|protected|public)?\s+isIfcPublicShare\(\):boolean\s*\{[\s\S]*?\n\s*ngOnInit\(", re.M)
        replacement = (
            "  private" + replacement_body.replace("  isIfcPublicShare", " isIfcPublicShare") + "\n\n"
            "  ngOnInit("
        )
        new_text, count = pattern.subn(replacement, text)
        if count:
            return new_text

    # BCF split left/right sometimes accumulates extra catch blocks; replace until ngOnInit
    if path.endswith("/bcf/split/left/bcf-split-left.component.ts") or path.endswith("/bcf/split/right/bcf-split-right.component.ts"):
        pattern = re.compile(r"\s*(private|protected|public)?\s+isIfcPublicShare\(\):boolean\s*\{[\s\S]*?\n\s*ngOnInit\(", re.M)
        replacement = (
            "  public" + replacement_body.replace("  isIfcPublicShare", " isIfcPublicShare") + "\n\n"
            "  ngOnInit("
        )
        new_text, count = pattern.subn(replacement, text)
        if count:
            return new_text

    # IFC viewer page sometimes accumulates extra catch blocks; replace until text block
    if path.endswith("/ifc-viewer-page.component.ts"):
        pattern = re.compile(r"\s*(private|protected|public)?\s+isIfcPublicShare\(\):boolean\s*\{[\s\S]*?\n\s*text\s*=", re.M)
        replacement = (
            "  protected" + replacement_body.replace("  isIfcPublicShare", " isIfcPublicShare") + "\n\n"
            "  text ="
        )
        new_text, count = pattern.subn(replacement, text)
        if count:
            return new_text

    # General replacement for any visibility modifier
    pattern = re.compile(r"(private|protected|public)?\s*isIfcPublicShare\(\):boolean\s*\{[\s\S]*?\n\s*\}", re.M)
    def repl(match):
        vis = (match.group(1) + " ") if match.group(1) else ""
        return ("  " + vis + replacement_body.replace("  isIfcPublicShare", "isIfcPublicShare"))
    return pattern.sub(repl, text)

for path in files:
    p = Path(path)
    if not p.exists():
        continue
    text = p.read_text()
    new_text = normalize(text, path)
    # Fix accidental inline joins from earlier replacements
    if path.endswith("/bcf-view.service.ts"):
        new_text = new_text.replace("};  private isIfcPublicShare():boolean {", "};\n\n  private isIfcPublicShare():boolean {")
        new_text = new_text.replace("  constructor(\n\n    private readonly", "  constructor(\n    private readonly")
    if path.endswith("/partitioned-query-space-page.component.ts"):
        new_text = new_text.replace(
            "protected inviteModal = InviteUserModalComponent;  protected isIfcPublicShare():boolean {",
            "protected inviteModal = InviteUserModalComponent;\n\n  protected isIfcPublicShare():boolean {"
        )
    if path.endswith("/bcf/split/left/bcf-split-left.component.ts"):
        new_text = new_text.replace(
            "constructor(private readonly bcfView:BcfViewService) {}  public isIfcPublicShare():boolean {",
            "constructor(private readonly bcfView:BcfViewService) {}\n\n  public isIfcPublicShare():boolean {"
        )
    if path.endswith("/bcf/split/right/bcf-split-right.component.ts"):
        new_text = new_text.replace(
            "constructor(private readonly bcfView:BcfViewService) {}  public isIfcPublicShare():boolean {",
            "constructor(private readonly bcfView:BcfViewService) {}\n\n  public isIfcPublicShare():boolean {"
        )
    if path.endswith("/ifc-viewer-page.component.ts"):
        new_text = new_text.replace(
            "export class IFCViewerPageComponent extends PartitionedQuerySpacePageComponent implements UntilDestroyedMixin, OnInit {  protected isIfcPublicShare():boolean {",
            "export class IFCViewerPageComponent extends PartitionedQuerySpacePageComponent implements UntilDestroyedMixin, OnInit {\n\n  protected isIfcPublicShare():boolean {"
        )
    if new_text != text:
        p.write_text(new_text)
PY

# Ensure shareToken reads cookie if param missing
python3 - <<'PY'
from pathlib import Path
import re

path = Path("/opt/openproject/plugins/costos/app/assets/javascripts/costos/ifc.js")
text = path.read_text()

read_cookie = (
    "  function readCookie(name) {\n"
    "    try {\n"
    "      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));\n"
    "      return match ? decodeURIComponent(match[1]) : '';\n"
    "    } catch (e) {\n"
    "      return '';\n"
    "    }\n"
    "  }\n\n"
)

if "function readCookie(" not in text:
    text = text.replace("  function shareToken() {\n", read_cookie + "  function shareToken() {\n")

pattern = re.compile(r"  function shareToken\\(\\) \\{[\\s\\S]*?\\n  \\}\\n", re.M)
replacement = (
    "  function shareToken() {\n"
    "    try {\n"
    "      var params = new URLSearchParams(window.location.search || \"\");\n"
    "      var token = params.get(\"share_token\") || \"\";\n"
    "      if (token) return token;\n"
    "      var href = String(window.location.href || \"\");\n"
    "      var match = href.match(/share_token=([^&#]+)/);\n"
    "      if (match && match[1]) return decodeURIComponent(match[1]);\n"
    "      return readCookie('ifc_share_token') || \"\";\n"
    "    } catch (e) {\n"
    "      return readCookie('ifc_share_token') || \"\";\n"
    "    }\n"
    "  }\n"
)
if pattern.search(text):
    text = pattern.sub(replacement, text)
else:
    text = text.replace(
        "  function shareToken() {\n"
        "    try {\n"
        "      var params = new URLSearchParams(window.location.search || \"\");\n"
        "      return params.get(\"share_token\") || \"\";\n"
        "    } catch (e) {\n"
        "      return \"\";\n"
        "    }\n"
        "  }\n",
        replacement
    )

path.write_text(text)
PY

echo "[costos] Normalized public share detection"

NGZONE_PATCH_SCRIPT="$(cd "$(dirname "$0")" && pwd)/apply_ifc_viewer_ngzone_patch.sh"

if [[ -f "$NGZONE_PATCH_SCRIPT" ]]; then
  echo "[costos] Applying IFC viewer NgZone patch..."
  bash "$NGZONE_PATCH_SCRIPT" /opt/openproject
else
  echo "[costos] NgZone patch script not found: $NGZONE_PATCH_SCRIPT" >&2
  exit 1
fi
