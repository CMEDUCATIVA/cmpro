# frozen_string_literal: true

module Costos
  module Ifc
    module AttachmentPatch
      extend ActiveSupport::Concern

      included do
        after_commit :log_ifc_attachment_create, on: :create
        after_commit :log_ifc_attachment_update, on: :update
      end

      private

      def ifc_attachment?
        name = filename.to_s.downcase
        return true if name.end_with?(".ifc")

        desc = description.to_s.downcase
        return true if desc == "ifc"

        content_type.to_s.downcase.include?("ifc")
      end

      def log_ifc_attachment_create
        log_ifc_attachment("ifc_attachment_create")
      end

      def log_ifc_attachment_update
        log_ifc_attachment("ifc_attachment_update",
                           changes: previous_changes.slice("status", "filesize", "content_type", "description"))
      end

      def log_ifc_attachment(event, extra = {})
        return unless ifc_attachment?

        project_id =
          if respond_to?(:project) && project
            project.id
          elsif container.respond_to?(:project_id)
            container.project_id
          end

        Costos::Ifc::Logger.log(event, {
          attachment_id: id,
          filename: filename,
          content_type: content_type,
          filesize: filesize,
          status: status,
          description: description,
          container_type: container_type,
          container_id: container_id,
          author_id: author_id,
          project_id: project_id
        }.merge(extra))
      end
    end
  end
end
