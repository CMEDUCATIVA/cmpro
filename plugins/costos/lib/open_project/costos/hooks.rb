# Ensure Redmine::I18n exists even when OpenProject's core hasn't loaded it yet
begin
  require 'redmine/i18n'
rescue LoadError
  unless defined?(Redmine::I18n)
    module Redmine
      module I18n
        def self.l(*args)
          ::I18n.t(*args)
        end
      end
    end
  end
end

require 'open_project/hook'

module OpenProject
  module Costos
    class Hooks < OpenProject::Hook::ViewListener
      render_on :view_layouts_base_html_head,
                partial: 'costos/hooks/cost_entries_assets'
    end
  end
end
