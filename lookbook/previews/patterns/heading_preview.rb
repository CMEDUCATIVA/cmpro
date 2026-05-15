# frozen_string_literal: true

module Patterns
  # @hidden
  class HeadingPreview < ViewComponent::Preview
    def default
      render(Primer::OpenProject::Heading.new(tag: :h2)) { "Hello world" }
    end
  end
end
