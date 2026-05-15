# frozen_string_literal: true

module OpenProject::WorkPackages
  # @logical_path OpenProject/WorkPackages
  class InfoLineComponentPreview < ViewComponent::Preview
    # See the [component documentation](/lookbook/pages/components/work_package_info_line) for more details.
    def playground
      render(WorkPackages::InfoLineComponent.new(work_package: WorkPackage.visible.first))
    end
  end
end
