# frozen_string_literal: true

require "json"
require "tmpdir"
require "fileutils"
require "time"

module Costos
  module Ifc
    module ProgressStore
      module_function

      STAGE_PROGRESS = {
        "dae" => 20,
        "gltf" => 45,
        "json" => 65,
        "xkt" => 80
      }.freeze

      STEP_PROGRESS = {
        "dae" => 40,
        "gltf" => 60,
        "json" => 78,
        "xkt" => 95
      }.freeze

      def record_event(model_id:, event:, status: nil, stage: nil, step: nil, exitstatus: nil, error: nil)
        return if model_id.to_i <= 0

        current = read(model_id) || {}
        normalized_status = normalize_status(status) || normalize_status(current[:status]) || "pending"
        progress = Integer(current[:progress] || 0) rescue 0

        case event.to_s
        when "ifc_conversion_start"
          normalized_status = "pending"
          progress = [progress, 3].max
        when "ifc_stage_start"
          normalized_status = "processing"
          progress = [progress, STAGE_PROGRESS[stage.to_s] || 25].max
        when "ifc_conversion_step"
          if exitstatus.to_i.zero?
            normalized_status = "processing" if normalized_status == "pending"
            progress = [progress, STEP_PROGRESS[step.to_s] || 35].max
          else
            normalized_status = "error"
            progress = 100
          end
        when "ifc_conversion_end"
          if error.to_s.empty? && normalized_status != "error"
            normalized_status = "completed"
          else
            normalized_status = "error"
          end
          progress = 100
        when "ifc_conversion_exception"
          normalized_status = "error"
          progress = 100
        end

        persist(model_id, {
          status: normalized_status,
          progress: [[progress, 0].max, 100].min,
          stage: stage.to_s.empty? ? current[:stage] : stage.to_s,
          step: step.to_s.empty? ? current[:step] : step.to_s,
          updated_at: Time.now.utc.iso8601
        })
      rescue StandardError
        # best-effort store; conversion must not fail due to tracking
        nil
      end

      def read(model_id)
        path = model_path(model_id)
        return nil unless File.file?(path)
        JSON.parse(File.read(path), symbolize_names: true)
      rescue StandardError
        nil
      end

      def persist(model_id, payload)
        FileUtils.mkdir_p(store_dir)
        path = model_path(model_id)
        tmp = "#{path}.tmp.#{$PROCESS_ID || Process.pid}"
        File.write(tmp, JSON.dump(payload))
        FileUtils.mv(tmp, path)
      ensure
        File.delete(tmp) if defined?(tmp) && tmp && File.exist?(tmp)
      end

      def normalize_status(raw)
        value = raw.to_s.strip.downcase
        return nil if value.empty?
        return "completed" if value.include?("completed") || value.include?("complete") || value.include?("completado")
        return "processing" if value.include?("processing") || value.include?("procesando")
        return "pending" if value.include?("pending") || value.include?("pendiente")
        return "error" if value.include?("error") || value.include?("failed") || value.include?("fallido")
        nil
      end

      def store_dir
        File.join(Dir.tmpdir, "costos-ifc-progress")
      end

      def model_path(model_id)
        File.join(store_dir, "#{model_id}.json")
      end
    end
  end
end
