# frozen_string_literal: true

require "logger"

module Costos
  module Ifc
    module Logger
      DEFAULT_OUTPUT_MAX = (ENV["COSTOS_IFC_LOG_OUTPUT_MAX"] || "2000").to_i
      DEFAULT_FIELD_MAX = (ENV["COSTOS_IFC_LOG_FIELD_MAX"] || "220").to_i
      DEFAULT_ARRAY_MAX = (ENV["COSTOS_IFC_LOG_ARRAY_MAX"] || "8").to_i
      DEFAULT_HASH_MAX = (ENV["COSTOS_IFC_LOG_HASH_MAX"] || "8").to_i

      def self.logger
        @logger ||= ::Logger.new(Rails.root.join("log", "ifc.log")).tap do |log|
          log.progname = "IFC"
        end
      end

      def self.truncate(value, max = DEFAULT_OUTPUT_MAX)
        return value if value.nil?

        text = value.to_s
        return text if max <= 0 || text.length <= max

        text[0, max]
      end

      def self.sanitize_value(value)
        case value
        when String
          truncate(value, DEFAULT_FIELD_MAX)
        when Array
          trimmed = value.first(DEFAULT_ARRAY_MAX).map { |item| sanitize_value(item) }
          trimmed << "...(#{value.length - DEFAULT_ARRAY_MAX} more)" if value.length > DEFAULT_ARRAY_MAX
          trimmed
        when Hash
          trimmed = {}
          value.to_a.first(DEFAULT_HASH_MAX).each do |key, val|
            trimmed[key] = sanitize_value(val)
          end
          if value.length > DEFAULT_HASH_MAX
            trimmed[:_truncated] = value.length - DEFAULT_HASH_MAX
          end
          trimmed
        else
          value
        end
      end

      def self.log(event, payload = {})
        sanitized = payload.transform_values { |value| sanitize_value(value) }
        message = sanitized.map { |key, value| "#{key}=#{value.inspect}" }.join(" ")
        logger.info("#{event} #{message}".strip)
      end
    end
  end
end
