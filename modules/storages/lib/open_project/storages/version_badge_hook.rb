# frozen_string_literal: true

class OpenProject::Storages::VersionBadgeHook < OpenProject::Hook::ViewListener
  render_on :view_layouts_base_body_bottom, partial: "storages/hooks/version_badge_injector"
end
