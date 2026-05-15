# frozen_string_literal: true

module OpPrimer
  # @logical_path OpenProject/Primer
  class StatusButtonComponentPreview < ViewComponent::Preview
    # See the [component documentation](/lookbook/pages/components/status_button) for more details.
    # @display min_height 100px
    # @param readonly [Boolean]
    # @param disabled [Boolean]
    # @param size [Symbol] select [small, medium, large]
    def playground(readonly: false, disabled: false, size: :medium)
      status = OpPrimer::StatusButtonOption.new(name: "Open",
                                                tag: :a,
                                                color_ref: :open,
                                                color_namespace: :meeting_status,
                                                href: "/some/test")
      items = [
        status,
        OpPrimer::StatusButtonOption.new(name: "Closed",
                                         tag: :a,
                                         color_ref: :closed,
                                         color_namespace: :meeting_status,
                                         href: "/some/other/action")
      ]
      component = OpPrimer::StatusButtonComponent.new(current_status: status,
                                                      items:,
                                                      readonly:,
                                                      disabled:,
                                                      button_arguments: {
                                                        title: "Edit",
                                                        size:
                                                      })

      render(component)
    end

    # See the [component documentation](/lookbook/pages/components/status_button) for more details.
    # @display min_height 100px
    def with_icon(size: :medium)
      status = OpPrimer::StatusButtonOption.new(name: "Open",
                                                color_ref: :open,
                                                color_namespace: :meeting_status,
                                                icon: :unlock)

      items = [
        status,
        OpPrimer::StatusButtonOption.new(name: "Closed",
                                         color_ref: :closed,
                                         color_namespace: :meeting_status,
                                         icon: :lock)
      ]

      component = OpPrimer::StatusButtonComponent.new(current_status: status,
                                                      items: items,
                                                      readonly: false,
                                                      button_arguments: { size:, title: "foo" })

      render(component)
    end

    # See the [component documentation](/lookbook/pages/components/status_button) for more details.
    # @display min_height 150px
    def with_description(size: :medium)
      status = OpPrimer::StatusButtonOption.new(name: "Open",
                                                color_ref: :open,
                                                color_namespace: :meeting_status,
                                                icon: :unlock,
                                                description: "The status is open")

      items = [
        status,
        OpPrimer::StatusButtonOption.new(name: "Closed",
                                         color_ref: :closed,
                                         color_namespace: :meeting_status,
                                         icon: :lock,
                                         description: "The status is closed")
      ]

      component = OpPrimer::StatusButtonComponent.new(current_status: status,
                                                      items: items,
                                                      readonly: false,
                                                      button_arguments: { size:, title: "foo" })

      render(component)
    end
  end
end
