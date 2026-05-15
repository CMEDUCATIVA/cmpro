# frozen_string_literal: true

module Costos
  module Ifc
    module ViewConverterServicePatch
      require "fileutils"
      require "open3"
      require "shellwords"
      require "tmpdir"

      METADATA_CMD_ENV = "COSTOS_IFC_METADATA_CMD"
      METADATA_ARGS_ENV = "COSTOS_IFC_METADATA_ARGS"
      METADATA_FALLBACK_ENV = "COSTOS_IFC_METADATA_FALLBACK"
      METADATA_PYTHON_ENV = "COSTOS_IFC_METADATA_PYTHON"
      METADATA_SCRIPT_ENV = "COSTOS_IFC_METADATA_SCRIPT"
      IFC_CONVERTER_PATH_ENV = "COSTOS_IFC_CONVERTER_PATH"
      IFC_CONVERTER_PATH_LEGACY_ENV = "IFC_CONVERTER_PATH"

      def call
        log_conversion("ifc_conversion_start")

        super.tap do |result|
          log_conversion("ifc_conversion_end",
                         status: result.success? ? "success" : "failure",
                         error: ifc_model.conversion_error_message)
        end
      rescue StandardError => e
        log_conversion("ifc_conversion_exception", error: e.message, error_class: e.class.name)
        raise
      end

      private

      def convert_to_collada(ifc_filepath)
        converter = ifc_converter_executable

        log_conversion("ifc_convert_binary_selected",
                       converter: converter,
                       configured: configured_ifc_converter_path)
        log_conversion("ifc_stage_start",
                       stage: "dae",
                       converter: converter,
                       source: ifc_filepath)

        convert!(ifc_filepath, "dae") do |target_file|
          Open3.capture2e(
            converter,
            "--use-element-guids",
            "--no-progress",
            "--verbose",
            "--threads",
            "4",
            ifc_filepath,
            target_file,
            "--exclude",
            "entities",
            "IfcOpeningElement",
            chdir: working_directory
          )
        end
      end

      def convert_to_gltf(dae_filepath)
        log_conversion("ifc_stage_start",
                       stage: "gltf",
                       converter: "COLLADA2GLTF",
                       source: dae_filepath)
        super
      end

      def convert_metadata(ifc_filepath)
        log_conversion("ifc_stage_start",
                       stage: "json",
                       converter: "xeokit-metadata",
                       source: ifc_filepath)
        core_metadata = super(ifc_filepath)
        run_secondary_metadata_extraction(ifc_filepath)
        core_metadata
      end

      def convert_to_xkt(gltf_filepath)
        log_conversion("ifc_stage_start",
                       stage: "xkt",
                       converter: "gltf2xkt",
                       source: gltf_filepath)
        super
      end

      def run_secondary_metadata_extraction(ifc_filepath)
        target_file = File.join(working_directory, "model_ifcopenshell.json")
        script = default_metadata_script_path
        unless script && File.exist?(script)
          log_conversion("ifc_metadata_secondary_step",
                         source: ifc_filepath,
                         target: target_file,
                         exitstatus: nil,
                         output: "",
                         error: "metadata script not found")
          return nil
        end

        command = ["python3", script, "--input", ifc_filepath, "--output", target_file]
        log_conversion("ifc_metadata_secondary_start",
                       source: ifc_filepath,
                       target: target_file,
                       command: command.join(" "))

        out, status = Open3.capture2e(*command, chdir: working_directory)
        output = out.to_s.strip
        truncated = false
        if output.length > Costos::Ifc::Logger::DEFAULT_OUTPUT_MAX && Costos::Ifc::Logger::DEFAULT_OUTPUT_MAX > 0
          output = Costos::Ifc::Logger.truncate(output)
          truncated = true
        end

        extra = {
          command: command.join(" "),
          source: ifc_filepath,
          target: target_file,
          exitstatus: status.exitstatus,
          output: output
        }
        extra[:output_truncated] = true if truncated

        if status.exitstatus.zero? && File.exist?(target_file)
          json_info = json_metadata_info(target_file) || {}
          extra.merge!(json_info)
          log_conversion("ifc_metadata_secondary_step", **extra)
          if json_info[:pset_hits].to_i == 0
            log_conversion("ifc_metadata_secondary_no_psets",
                           source: ifc_filepath,
                           target: target_file,
                           json_bytes: json_info[:json_bytes],
                           pset_hits: json_info[:pset_hits])
          end
          attach_metadata_file(target_file, description: "ifc_meta_ifcopenshell")
          return target_file
        end

        log_conversion("ifc_metadata_secondary_step", **extra.merge(error: "metadata command failed"))
        nil
      end

      def build_metadata_command(cmd, args_template, input_path, output_path)
        args = []
        unless args_template.empty?
          args = Shellwords.split(args_template).map do |arg|
            arg.gsub("{input}", input_path).gsub("{output}", output_path)
          end
        end

        [cmd, *args]
      end

      def default_metadata_script_path
        candidates = [
          Rails.root.join("plugins", "costos", "lib", "costos", "ifc", "ifc_metadata_extractor.py"),
          Rails.root.join("modules", "costos", "lib", "costos", "ifc", "ifc_metadata_extractor.py")
        ]

        found = candidates.find { |candidate| File.exist?(candidate) }
        found ? found.to_s : nil
      end

      def validate!
        missing = self.class::PIPELINE_COMMANDS - self.class.available_commands
        missing -= ["IfcConvert"] if custom_ifc_converter_available?

        if missing.any?
          log_conversion("ifc_conversion_missing_commands", missing: missing)
          raise I18n.t("ifc_models.conversion.missing_commands", names: missing.join(", "))
        end

        true
      end

      def convert!(source_file, ext, &block)
        raise ArgumentError, "missing working directory" unless working_directory.present?

        filename = File.basename(source_file, ".*")
        target_filename = "#{filename}.#{ext}"
        target_file = File.join(working_directory, target_filename)
        started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

        log_conversion("ifc_conversion_step_start",
                       step: ext,
                       source: source_file,
                       target: target_file)

        out, status = yield target_file
        duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round(2)

        output = out.to_s.strip
        truncated = false
        if output.length > Costos::Ifc::Logger::DEFAULT_OUTPUT_MAX && Costos::Ifc::Logger::DEFAULT_OUTPUT_MAX > 0
          output = Costos::Ifc::Logger.truncate(output)
          truncated = true
        end

        extra = {
          step: ext,
          source: source_file,
          target: target_file,
          duration_ms: duration_ms,
          exitstatus: status.exitstatus,
          output: output
        }
        extra[:output_truncated] = true if truncated

        if ext == "json"
          json_info = json_metadata_info(target_file)
          extra.merge!(json_info) if json_info
          log_conversion("ifc_core_metadata_info",
                         source: source_file,
                         target: target_file,
                         **(json_info || {}))
        end

        log_conversion("ifc_conversion_step",
                       **extra)

        if status.exitstatus != 0
          raise "Failed to convert #{filename} to #{ext}: #{out}"
        end

        target_file
      end

      def log_conversion(event, extra = {})
        model = ifc_model
        attachment = model&.ifc_attachment

        begin
          Costos::Ifc::ProgressStore.record_event(
            model_id: model&.id,
            event: event,
            status: model&.conversion_status,
            stage: extra[:stage],
            step: extra[:step],
            exitstatus: extra[:exitstatus],
            error: extra[:error]
          )
        rescue StandardError
          # best effort, never break conversion flow due to progress tracking
        end

        Costos::Ifc::Logger.log(event, {
          ifc_model_id: model&.id,
          project_id: model&.project_id,
          attachment_id: attachment&.id,
          filename: attachment&.filename,
          conversion_status: model&.conversion_status
        }.merge(extra))
      end

      def attach_metadata_file(path, description: nil)
        model = ifc_model
        return unless model && File.exist?(path)

        filename = File.basename(path)
        attachment_description = description || filename
        begin
          Attachment.where(container_type: model.class.name, container_id: model.id, filename: filename).delete_all
        rescue StandardError
          # ignore cleanup errors
        end

        author =
          if model.respond_to?(:author) && model.author
            model.author
          elsif defined?(User) && User.respond_to?(:system)
            User.system
          else
            nil
          end

        attachment = Attachment.new(
          file: File.open(path),
          filename: filename,
          content_type: "application/json",
          author: author,
          container: model,
          description: attachment_description
        )

        if attachment.save
          log_conversion("ifc_metadata_attachment",
                         attachment_id: attachment.id,
                         filename: filename,
                         description: attachment_description)
        else
          log_conversion("ifc_metadata_attachment_failed", errors: attachment.errors.full_messages.join(", "))
        end
      rescue StandardError => e
        log_conversion("ifc_metadata_attachment_failed", error: e.message)
      end

      def json_metadata_info(path)
        return unless File.exist?(path)

        info = { json_bytes: File.size(path) }
        data = File.read(path)
        # Heuristic counts to detect presence of property sets without logging full content.
        info[:pset_hits] = data.scan(/"Pset_|"PropertySet"|propertySets/i).length

        # Sample property set names to confirm presence without dumping the whole JSON.
        pset_names = data.scan(/"Pset_[^"]+"|"PropertySet"\s*:\s*"[^"]+"/i).map do |match|
          match.gsub(/\A"|"$/, "").gsub(/\APropertySet"\s*:\s*"/i, "")
        end
        pset_names = pset_names.uniq.first(15)
        info[:pset_names_sample] = pset_names if pset_names.any?

        # Sample other property keys (limited).
        prop_keys = data.scan(/"[^"]+"\s*:/).map { |m| m.gsub(/["\s:]/, "") }
        prop_keys = prop_keys.uniq.first(15)
        info[:property_keys_sample] = prop_keys if prop_keys.any?

        info
      rescue StandardError => e
        { json_error: e.message }
      end

      def ifc_converter_executable
        configured = configured_ifc_converter_path
        return "IfcConvert" if configured.blank?

        runnable = runnable_binary_path(configured)
        if runnable
          runnable
        else
          log_conversion("ifc_convert_binary_invalid",
                         configured: configured,
                         fallback: "IfcConvert")
          "IfcConvert"
        end
      end

      def custom_ifc_converter_available?
        configured = configured_ifc_converter_path
        configured.present? && File.file?(configured) && File.executable?(configured)
      end

      def configured_ifc_converter_path
        plugin_ifc_converter_path ||
          ENV[IFC_CONVERTER_PATH_ENV].presence ||
          ENV[IFC_CONVERTER_PATH_LEGACY_ENV].presence
      end

      def plugin_ifc_converter_path
        install_plugin_ifcconvert_from_vendor_if_needed!
        plugin_ifc_converter_candidates.each do |path|
          next unless File.file?(path)
          runnable = runnable_binary_path(path)
          return runnable if runnable
        end
        nil
      end

      def plugin_ifc_converter_candidates
        [
          Rails.root.join("plugins", "costos", "bin", "IfcConvert").to_s,
          Rails.root.join("modules", "costos", "bin", "IfcConvert").to_s,
          Rails.root.join("plugins", "costos", "bin", "IfcConvert-0.8.5").to_s,
          Rails.root.join("modules", "costos", "bin", "IfcConvert-0.8.5").to_s,
          Rails.root.join("plugins", "costos", "vendor", "ifcconvert", "linux-amd64", "IfcConvert").to_s,
          Rails.root.join("modules", "costos", "vendor", "ifcconvert", "linux-amd64", "IfcConvert").to_s
        ]
      end

      def vendor_ifc_converter_candidates
        [
          Rails.root.join("plugins", "costos", "vendor", "ifcconvert", "linux-amd64", "IfcConvert").to_s,
          Rails.root.join("modules", "costos", "vendor", "ifcconvert", "linux-amd64", "IfcConvert").to_s
        ]
      end

      def bin_ifc_converter_candidates
        [
          Rails.root.join("plugins", "costos", "bin", "IfcConvert").to_s,
          Rails.root.join("modules", "costos", "bin", "IfcConvert").to_s
        ]
      end

      def install_plugin_ifcconvert_from_vendor_if_needed!
        current = bin_ifc_converter_candidates.find { |path| File.file?(path) && ensure_executable(path) }
        return current if current

        source = vendor_ifc_converter_candidates.find { |path| File.file?(path) }
        return nil unless source
        return nil unless File.readable?(source)

        target = bin_ifc_converter_candidates.first
        begin
          FileUtils.mkdir_p(File.dirname(target))
          FileUtils.cp(source, target)
          if ensure_executable(target)
            log_conversion("ifc_convert_binary_installed_from_vendor", source: source, target: target)
          else
            log_conversion("ifc_convert_binary_install_failed",
                           source: source,
                           target: target,
                           error: "target not executable after copy")
          end
        rescue StandardError => e
          log_conversion("ifc_convert_binary_install_failed", source: source, target: target, error: e.message)
        end
      end

      def ensure_executable(path)
        return false unless File.file?(path)
        return true if File.executable?(path)

        @_costos_ifc_chmod_attempted ||= {}
        return false if @_costos_ifc_chmod_attempted[path]
        @_costos_ifc_chmod_attempted[path] = true

        begin
          mode = File.stat(path).mode | 0o111
          File.chmod(mode, path)
        rescue StandardError => e
          log_conversion("ifc_convert_chmod_failed", path: path, error: e.message)
        end

        File.executable?(path)
      end

      def runnable_binary_path(path)
        return nil unless File.file?(path)
        return path if ensure_executable(path)
        stage_executable_copy(path)
      end

      def stage_executable_copy(source_path)
        digest = begin
          require "digest"
          Digest::SHA256.file(source_path).hexdigest[0, 16]
        rescue StandardError
          File.basename(source_path).gsub(/[^a-zA-Z0-9_.-]/, "_")
        end

        target_dir = File.join(Dir.tmpdir, "costos-ifcconvert")
        target_path = File.join(target_dir, "IfcConvert-#{digest}")

        begin
          FileUtils.mkdir_p(target_dir)
          if !File.exist?(target_path) || File.size(target_path) != File.size(source_path)
            FileUtils.cp(source_path, target_path)
          end
          return target_path if ensure_executable(target_path)
          log_conversion("ifc_convert_stage_copy_failed",
                         source: source_path,
                         target: target_path,
                         error: "staged copy not executable")
        rescue StandardError => e
          log_conversion("ifc_convert_stage_copy_failed",
                         source: source_path,
                         target: target_path,
                         error: e.message)
        end

        nil
      end
    end
  end
end
