# frozen_string_literal: true

module OpenProject::WorkPackages
  # @logical_path OpenProject/WorkPackages
  class StatusButtonComponentPreview < ViewComponent::Preview
    # !! Currently nothing happens when changing the status!!
    # @display min_height 400px
    # @param readonly [Boolean]
    # @param size [Symbol] select [small, medium, large]
    def playground(readonly: true, size: :medium)
      user = FactoryBot.build_stubbed(:admin)
      work_package = FactoryBot.build_stubbed(:work_package, status: Status.first)
      render(WorkPackages::StatusButtonComponent.new(work_package:,
                                                     user:,
                                                     readonly:,
                                                     button_arguments: { size: }))
    end
  end
end
