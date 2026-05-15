module OpenProject
  module IaColaborativa
    class Hooks < OpenProject::Hook::ViewListener
      # Inyectar el boton flotante solo en sesiones autenticadas.
      def view_layouts_base_body_bottom(context = {})
        return ''.html_safe unless render_chat_for?(context)

        context[:controller].send(:render_to_string, {
          partial: 'ia_colaborativa/hooks/floating_button',
          locals: { context: context }
        })
      end

      private

      def render_chat_for?(context)
        controller = context[:controller]
        return false unless controller

        current_user =
          if controller.respond_to?(:current_user, true)
            controller.send(:current_user)
          elsif defined?(::User) && ::User.respond_to?(:current)
            ::User.current
          end

        return false unless current_user&.respond_to?(:logged?) && current_user.logged?

        controller_name = controller.respond_to?(:controller_name) ? controller.controller_name.to_s : ''
        action_name = controller.respond_to?(:action_name) ? controller.action_name.to_s : ''

        return false if controller_name == 'account' && %w[login register lost_password].include?(action_name)

        true
      rescue StandardError
        false
      end
    end
  end
end
