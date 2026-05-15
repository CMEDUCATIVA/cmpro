module Bim
  module IfcModels
    class IfcModel < ApplicationRecord
      # Note: rails 7.1 breaks the class' ancestor chain, if it fails to infer the enum attribute's
      # type. We reference the Project class in migrations prior to the `conversion_status` column being added
      # to the database, which leads to rails failing to infer the enum's type.
      # The `conversion_status`'s type needs to be declared so rails will do the correct type inference and
      # not break the ancestor chain. Once this is fixed in rails, we can remove it.
      attribute :conversion_status, :integer

      enum :conversion_status, {
        pending: 0,
        processing: 1,
        completed: 2,
        error: 3
      }

      acts_as_attachable delete_permission: :manage_ifc_models,
                         add_permission: :manage_ifc_models,
                         view_permission: :view_ifc_models

      belongs_to :project
      belongs_to :uploader, class_name: "User"

      validates :title, presence: true
      validates :project, presence: true
      validates :conversion_progress, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }, allow_nil: true

      scope :defaults, -> { where(is_default: true) }

      %i(ifc xkt metadata).each do |name|
        define_method :"#{name}_attachment" do
          get_latest_attached_type(name)
        end

        define_method :"#{name}_attachment=" do |file|
          if name == :ifc
            # Also delete derived files.
            delete_attachments :xkt
            delete_attachments :metadata
          end

          delete_attachments name
          filename = file.respond_to?(:original_filename) ? file.original_filename : File.basename(file.path)
          call = ::Attachments::CreateService
            .bypass_allowlist(user: User.current)
            .call(file:, container: self, filename:, description: name)

          call.on_failure { Rails.logger.error "Failed to add #{name} attachment: #{call.message}" }
        end
      end

      def converted?
        xkt_attachment.present?
      end

      def conversion_progress_value
        conversion_progress.to_i.clamp(0, 100)
      end

      private

      ##
      # Return the newest attachment for the given type.
      def get_latest_attached_type(key)
        if attachments.loaded?
          matches = attachments.select { |a| a.description == key.to_s && !a.marked_for_destruction? }

          if matches.length > 1
            Rails.logger.warn("[BIM::IFC] duplicate_attachments ifc_model_id=#{id} type=#{key} count=#{matches.length}")
          end

          matches.max_by(&:id)
        else
          scope = attachments.where(description: key.to_s)
          count = scope.count
          if count > 1
            Rails.logger.warn("[BIM::IFC] duplicate_attachments ifc_model_id=#{id} type=#{key} count=#{count}")
          end

          scope.order(id: :desc).first
        end
      end

      ##
      # Delete all attachments for the given type to avoid stale pairings.
      def delete_attachments(key)
        if attachments.loaded?
          attachments.select { |a| a.description == key.to_s && !a.marked_for_destruction? }.each(&:destroy)
        else
          attachments.where(description: key.to_s).find_each(&:destroy)
        end
      end
    end
  end
end
