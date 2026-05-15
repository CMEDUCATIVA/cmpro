#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_FILE="$ROOT_DIR/plugins/ia_colaborativa/lib/open_project/ia_colaborativa/engine.rb"
AI_BUTTON_FILE="$ROOT_DIR/plugins/ia_colaborativa/app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js"

if [[ ! -f "$ENGINE_FILE" || ! -f "$AI_BUTTON_FILE" ]]; then
  echo "Expected plugin files were not found."
  exit 1
fi

perl -0pi -e "s/\\n\\s*ENV\\['LIGHTRAG_URL'\\]\\s*\\|\\|=\\s*'[^']*'//g" "$ENGINE_FILE"
perl -0pi -e "s/\\n\\s*ENV\\['LIGHTRAG_API_KEY'\\]\\s*\\|\\|=\\s*'[^']*'//g" "$ENGINE_FILE"
perl -0pi -e "s/\\n\\s*ENV\\['MCP_SERVER_URL'\\]\\s*\\|\\|=\\s*'[^']*'//g" "$ENGINE_FILE"
perl -0pi -e "s/\\n\\s*ENV\\['OPENAI_API_KEY'\\]\\s*\\|\\|=\\s*'[^']*'//g" "$ENGINE_FILE"
perl -0pi -e "s/const PROMPT_PASSWORD = '[^']*';/const PROMPT_PASSWORD = window.OPENPROJECT_IA_PROMPT_PASSWORD || '';/g" "$AI_BUTTON_FILE"
perl -0pi -e "s/input\\.value\\.trim\\(\\) === PROMPT_PASSWORD/PROMPT_PASSWORD \&\& input.value.trim() === PROMPT_PASSWORD/g" "$AI_BUTTON_FILE"

echo "Hardcoded IA secrets were removed. Put real values in deploy/.env on each server."

