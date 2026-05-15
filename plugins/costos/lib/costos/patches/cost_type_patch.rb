# frozen_string_literal: true

require 'bigdecimal'

module Costos
  module Patches
    module CostTypePatch
      extend ActiveSupport::Concern

      def new_rate_attributes=(rate_attributes)
        normalize_rate_collection(rate_attributes).each do |index, attrs|
          next unless attrs

          normalized = normalize_rate_numbers(index, attrs)
          next unless rate_values_present?(normalized)

          rates.build(normalized)
        end
      end

      def existing_rate_attributes=(rate_attributes)
        source = normalize_rate_collection(rate_attributes)

        rates.reject(&:new_record?).each do |rate|
          attrs = source[rate.id.to_s] || source[rate.id]
          next unless attrs

          normalized = normalize_rate_numbers(rate.id.to_s, attrs)
          if rate_values_present?(normalized)
            rate.attributes = normalized
          else
            rates.delete(rate)
          end
        end
      end

      private

      def normalize_rate_numbers(index, attributes)
        attrs = to_indifferent_hash(attributes)
        attrs[:rate] = parse_decimal_value(attrs[:rate]) if attrs[:rate]
        attrs[:sale_rate] = parse_decimal_value(attrs[:sale_rate]) if attrs[:sale_rate]
        attrs[:study_rate] = parse_decimal_value(attrs[:study_rate]) if attrs[:study_rate]
        attrs[:index] = index if attrs[:index].blank?
        attrs
      end

      def rate_values_present?(attrs)
        attrs[:rate].present? || attrs[:sale_rate].present? || attrs[:study_rate].present?
      end

      def to_indifferent_hash(attributes)
        hash = if attributes.respond_to?(:to_unsafe_h)
                 attributes.to_unsafe_h
               elsif attributes.respond_to?(:to_h)
                 attributes.to_h
               else
                 attributes
               end
        (hash || {}).with_indifferent_access
      end

      def normalize_rate_collection(collection)
        return {} if collection.blank?

        case collection
        when ActionController::Parameters
          normalize_rate_collection(collection.to_unsafe_h)
        when Hash
          collection
        when Array
          collection.each_with_index.each_with_object({}) do |(attrs, idx), memo|
            memo[index_from_attrs(attrs, idx)] = attrs
          end
        else
          Array(collection).each_with_index.each_with_object({}) do |(attrs, idx), memo|
            memo[idx.to_s] = attrs
          end
        end
      end

      def index_from_attrs(attrs, fallback)
        if attrs.respond_to?(:[])
          value = attrs[:index] || attrs['index']
          return value.to_s if value.present?
        end

        fallback.to_s
      end

      def parse_decimal_value(raw_value)
        return nil if raw_value.nil?

        string = raw_value.to_s.strip
        return nil if string.blank?

        normalized = normalize_decimal_string(string)
        BigDecimal(normalized)
      rescue ArgumentError, TypeError
        nil
      end

      def normalize_decimal_string(value)
        candidate = value.delete(" \u00A0")
        comma_index = candidate.rindex(',')
        dot_index = candidate.rindex('.')

        if comma_index && dot_index
          if comma_index > dot_index
            candidate = candidate.delete('.')
            candidate = candidate.sub(',', '.')
          else
            candidate = candidate.delete(',')
          end
        elsif comma_index
          candidate = candidate.tr(',', '.')
        else
          candidate = candidate.delete(',')
        end

        candidate
      end
    end
  end
end
