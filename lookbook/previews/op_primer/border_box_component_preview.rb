# frozen_string_literal: true

module OpPrimer
  # @hidden
  # @display min_height 400px
  class BorderBoxComponentPreview < Lookbook::Preview
    def default
      render(Primer::Beta::BorderBox.new) do |component|
        component.with_header { "Header" }
        component.with_body { "Body" }
        component.with_row { "Row one" }
        component.with_row { "Row two" }
        component.with_row { "Row three" }
        component.with_footer { "Footer" }
      end
    end

    def collapsible
      render_with_template
    end
  end
end
