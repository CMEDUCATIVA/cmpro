# frozen_string_literal: true

module Patterns
  # @hidden
  class CollapsibleSectionPreview < ViewComponent::Preview
    # @display min_height 300px
    def default
      render_with_template
    end

    # @display min_height 300px
    def full_example
      render_with_template
    end
  end
end
