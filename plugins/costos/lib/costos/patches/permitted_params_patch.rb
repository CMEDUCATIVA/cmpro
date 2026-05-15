# frozen_string_literal: true

module Costos
  module Patches
    module PermittedParamsPatch
      def cost_type
        permitted = super
        raw = params[:cost_type]
        return permitted unless raw

        %i[new_rate_attributes existing_rate_attributes].each do |key|
          source = raw[key]
          target = permitted[key]
          next unless source && target

          normalized_source = normalize_source_collection(source)
          copy_rate_values(target, normalized_source)
        end

        permitted
      end

      private

      def normalize_source_collection(source)
        if source.is_a?(ActionController::Parameters)
          normalize_source_collection(source.to_unsafe_h)
        else
          source
        end
      end

      def copy_rate_values(target, source)
        if target.is_a?(Array)
          source_array = source.is_a?(Array) ? source : source.values
          target.each_with_index do |entry, idx|
            merge_rate_fields(entry, source_array[idx])
          end
        else
          source_hash = if source.is_a?(Hash)
                          source.transform_keys(&:to_s)
                        else
                          {}
                        end
          target.each do |key, entry|
            merge_rate_fields(entry, source_hash[key.to_s] || source_hash[key.to_i.to_s])
          end
        end
      end

      def merge_rate_fields(entry, raw_values)
        return unless entry && raw_values

        entry.permit! if entry.respond_to?(:permit!)

        %i[sale_rate study_rate].each do |field|
          val = raw_values[field] || raw_values[field.to_s]
          next if val.nil?

          entry[field] = val
        end
      end
    end
  end
end
