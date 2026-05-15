# frozen_string_literal: true

module OpPrimer
  # @logical_path OpenProject/Primer
  # @display min_height 300px
  class BorderBoxTableComponentPreview < Lookbook::Preview
    # See the [component documentation](/lookbook/pages/components/tables/border_box_table) for more details.
    def default
      render_with_template
    end

    # See the [component documentation](/lookbook/pages/components/tables/border_box_table) for more details.
    def custom_column_widths
      render_with_template
    end

    # See the [component documentation](/lookbook/pages/components/tables/border_box_table) for more details.
    def with_action_menu
      render_with_template
    end

    # See the [component documentation](/lookbook/pages/components/tables/border_box_table) for more details.
    def with_footer
      render_with_template
    end
  end
end
