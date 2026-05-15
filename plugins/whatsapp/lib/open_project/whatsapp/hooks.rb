module OpenProject
  module Whatsapp
    if defined?(OpenProject::Hook)
      class Hooks < OpenProject::Hook::ViewListener
        render_on :view_layouts_base_html_head, partial: "hooks/whatsapp/board_inject"
      end
    end
  end
end
