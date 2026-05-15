#-- copyright
# OpenProject is a project management system.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2017 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
# +
require "open3"
require "json"

module Bim
  module IfcModels
    class ViewConverterService
      attr_reader :ifc_model, :errors

      PIPELINE_COMMANDS ||= %w[IfcConvert COLLADA2GLTF gltf2xkt].freeze
      BUNDLED_IFC_CONVERTER_PATH = File.expand_path("../../../../vendor/ifcconvert/linux-amd64/IfcConvert", __dir__)
      IFC_METADATA_EXTRACTOR_SCRIPT = File.expand_path("../../../../bin/extract_ifc_metadata.py", __dir__)
      PROCESSING_STEPS = {
        preparation: "Preparacion",
        converting: "Convirtiendo",
        metadata: "Creando metadatos",
        completed: "Completado",
        error: "Error"
      }.freeze

      def initialize(ifc_model)
        @errors = ActiveModel::Errors.new(self)
        @ifc_model = ifc_model
      end

      ##
      # Check availability of the pipeline
      def self.available?
        available_commands.length == PIPELINE_COMMANDS.length
      end

      def self.available_commands
        cache_key = bundled_ifc_converter_path

        if @available_commands.nil? || @available_commands_cache_key != cache_key
          @available_commands = PIPELINE_COMMANDS.select do |command|
            if command == "IfcConvert"
              ifc_converter_available?
            else
              command_available?(command)
            end
          end
          @available_commands_cache_key = cache_key
        end

        @available_commands
      end

      def self.command_available?(command)
        _, status = Open3.capture2e("which", command)
        status.exitstatus.zero?
      end

      def self.ifc_converter_available?
        bundled = bundled_ifc_converter_path

        return false unless File.file?(bundled)
        return true if File.executable?(bundled)

        begin
          File.chmod(0o755, bundled)
        rescue StandardError => e
          Rails.logger.warn("[BIM::IFC] failed to chmod bundled IfcConvert at #{bundled}: #{e.message}")
          return false
        end

        File.executable?(bundled)
      end

      def self.bundled_ifc_converter_path
        BUNDLED_IFC_CONVERTER_PATH
      end

      def ifc_converter_executable
        bundled = self.class.bundled_ifc_converter_path
        ensure_executable!(bundled)

        Rails.logger.info("[BIM::IFC] using bundled IfcConvert at #{bundled}")
        bundled
      end

      def call
        ifc_model.processing!
        update_progress(progress: 5, step: PROCESSING_STEPS[:preparation], clear_error: true)

        validate!

        Dir.mktmpdir do |dir|
          self.working_directory = dir

          total_started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
          Rails.logger.info("[BIM::IFC] conversion_start ifc_model_id=#{ifc_model.id} project_id=#{ifc_model.project_id}")
          perform_conversion!
          total_duration_ms = elapsed_ms_since(total_started_at)
          Rails.logger.info("[BIM::IFC] conversion_success ifc_model_id=#{ifc_model.id} duration_ms=#{total_duration_ms}")

          update_progress(progress: 100,
                          step: PROCESSING_STEPS[:completed],
                          status: :completed,
                          clear_error: true)

          ServiceResult.new(success: true, result: ifc_model)
        end
      rescue StandardError => e
        Rails.logger.error("[BIM::IFC] conversion_error ifc_model_id=#{ifc_model&.id} error=#{e.class}: #{e.message}")
        OpenProject.logger.error("Failed to convert IFC to XKT", exception: e)

        update_progress(progress: ifc_model.conversion_progress_value,
                        step: PROCESSING_STEPS[:error],
                        status: :error,
                        error_message: e.message)

        ServiceResult.failure.tap { |r| r.errors.add(:base, e.message) }
      ensure
        self.working_directory = nil
      end

      private

      def perform_conversion!
        # Step 0: avoid file name issues (e.g. umlauts) in the pipeline
        tmp_ifc_path = link_to_ifc_file

        update_progress(progress: 15, step: PROCESSING_STEPS[:converting])
        collada_path = convert_to_collada(tmp_ifc_path) # Step 1: IfcConvert

        update_progress(progress: 45, step: PROCESSING_STEPS[:converting])
        gltf_path = convert_to_gltf(collada_path) # Step 2: Collada2GLTF

        update_progress(progress: 70, step: PROCESSING_STEPS[:converting])
        result = convert_to_xkt(gltf_path) # Step 3: Create XKT from extracted metadata JSON and GLTF

        update_progress(progress: 95, step: PROCESSING_STEPS[:converting])
        save_xkt(result[:xkt_path], result[:metadata_path])
      end

      def link_to_ifc_file
        return @tmp_ifc_path if @tmp_ifc_path

        @tmp_ifc_path = File.join working_directory, "model.ifc"

        FileUtils.symlink ifc_model_path.to_s, @tmp_ifc_path

        @tmp_ifc_path
      end

      def ifc_model_path
        Pathname(ifc_model.ifc_attachment.diskfile.path)
      end

      def save_xkt(xkt_path, metadata_path)
        final_xkt_path = change_basename xkt_path, ifc_model_path, ".xkt"
        final_metadata_path = change_basename metadata_path, ifc_model_path, ".json"

        # If the original file is already called 'model.ifc' then renaming the file is
        # unnecessary as the conversion result is already called model.xkt then.
        # Hence only rename if `xkt_path` is actually different from `final_xkt_path`.
        FileUtils.mv xkt_path, final_xkt_path.to_s unless xkt_path.to_s == final_xkt_path.to_s
        FileUtils.mv metadata_path, final_metadata_path.to_s unless metadata_path.to_s == final_metadata_path.to_s

        ifc_model.xkt_attachment = File.new final_xkt_path.to_s
        ifc_model.metadata_attachment = File.new final_metadata_path.to_s

        ensure_persisted_conversion_attachments!
      end

      ##
      # Call IfcConvert with an IFC file to output an identically-named
      # DAE collada file.
      #
      # @param ifc_filepath {String} Path to the IFC model file
      def convert_to_collada(ifc_filepath)
        Rails.logger.debug { "Converting #{ifc_model.inspect} to DAE" }
        converter = ifc_converter_executable
        Rails.logger.info("[BIM::IFC] executing #{converter} for model #{ifc_model.id}")

        convert!(ifc_filepath, "dae") do |target_file|
          # To include IfcSpace entities, which by default are excluded by
          # IfcConvert, together with IfcOpeningElement, we need to over-
          # write the default exclude parameter to only exclude
          # IfcOpeningElements.
          # https://github.com/IfcOpenShell/IfcOpenShell/wiki#ifconvert
          Open3.capture2e(converter,
                          "--use-element-guids",
                          "--no-progress",
                          "--verbose",
                          "--threads",
                          "4",
                          ifc_filepath,
                          target_file,
                          "--exclude",
                          "entities",
                          "IfcOpeningElement")
        end
      end

      ##
      # Call COLLADA2GLTF with the converted DAE file.
      #
      # @param dae_filepath {String} Path to the converted DAE model file
      def convert_to_gltf(dae_filepath)
        Rails.logger.debug { "Converting #{ifc_model.inspect} to GLTF" }

        convert!(dae_filepath, "gltf") do |target_file|
          Open3.capture2e("COLLADA2GLTF", "--materialsCommon", "-i", dae_filepath, "-o", target_file)
        end
      end

      ##
      # Call gltf2xkt with the converted gltf file.
      #
      # @param gltf_filepath {String} Path to the converted GLTF model file
      def convert_to_xkt(gltf_filepath)
        Rails.logger.debug { "Converting #{ifc_model.inspect} to XKT" }

        update_progress(progress: 80, step: PROCESSING_STEPS[:metadata])
        metadata_file = convert_metadata(link_to_ifc_file)
        update_progress(progress: 90, step: PROCESSING_STEPS[:converting])

        xkt_path = convert!(gltf_filepath, "xkt") do |target_file|
          Open3.capture2e("gltf2xkt", "-s", gltf_filepath, "-m", metadata_file, "-o", target_file)
        end

        { xkt_path:, metadata_path: metadata_file }
      end

      ##
      # Call xeokit-metadata
      #
      # @param ifc_filepath {String} Path to the converted IFC model file
      def convert_metadata(ifc_filepath)
        Rails.logger.debug { "Retrieving metadata of #{ifc_model.inspect}" }

        target_file = convert!(ifc_filepath, "json") do |output_file|
          metadata_extract_command(ifc_filepath, output_file)
        end

        property_set_count, property_count = metadata_counts(target_file)
        Rails.logger.info("[BIM::IFC] metadata_summary ifc_model_id=#{ifc_model.id} property_sets=#{property_set_count} properties=#{property_count}")

        target_file
      end

      def metadata_extract_command(ifc_filepath, target_file)
        if ifcopenshell_extractor_available?
          out, status = Open3.capture2e("python3", metadata_extractor_script, ifc_filepath, target_file)
          property_set_count, = metadata_counts(target_file)

          if status.exitstatus.zero? && property_set_count.positive?
            Rails.logger.info("[BIM::IFC] metadata_extractor=ifcopenshell script=#{metadata_extractor_script}")
            return [out, status]
          end

          Rails.logger.warn("[BIM::IFC] ifcopenshell metadata extractor failed_or_empty exitstatus=#{status.exitstatus} output=#{summarize_output(out)}")
        end

        if self.class.command_available?("xeokit-metadata")
          Rails.logger.warn("[BIM::IFC] metadata_extractor=fallback_xeokit_metadata")
          return Open3.capture2e("xeokit-metadata", ifc_filepath, target_file)
        end

        Open3.capture2e("python3", metadata_extractor_script, ifc_filepath, target_file)
      end

      def ifcopenshell_extractor_available?
        File.file?(metadata_extractor_script) && self.class.command_available?("python3")
      end

      def metadata_extractor_script
        IFC_METADATA_EXTRACTOR_SCRIPT
      end

      def metadata_counts(metadata_file)
        parsed = JSON.parse(File.read(metadata_file))
        property_sets = Array(parsed["propertySets"])
        properties = property_sets.sum { |pset| Array(pset["properties"]).length }
        [property_sets.length, properties]
      rescue StandardError => e
        Rails.logger.warn("[BIM::IFC] failed to parse metadata file #{metadata_file}: #{e.class}: #{e.message}")
        [0, 0]
      end

      def validate!
        unless self.class.available?
          missing = PIPELINE_COMMANDS - self.class.available_commands
          raise I18n.t("ifc_models.conversion.missing_commands", names: missing.join(", "))
        end

        if !ifcopenshell_extractor_available? && !self.class.command_available?("xeokit-metadata")
          raise I18n.t("ifc_models.conversion.missing_commands", names: "xeokit-metadata or python3+ifcopenshell extractor")
        end

        true
      end

      ##
      # Build input filename and target filename
      def convert!(source_file, ext)
        raise ArgumentError, "missing working directory" unless working_directory.present?

        filename = File.basename(source_file, ".*")
        target_filename = "#{filename}.#{ext}"
        target_file = File.join(working_directory, target_filename)
        started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

        Rails.logger.info("[BIM::IFC] step_start ifc_model_id=#{ifc_model.id} step=#{ext} source=#{source_file} target=#{target_file}")

        out, status = yield target_file
        duration_ms = elapsed_ms_since(started_at)

        if status.exitstatus != 0
          Rails.logger.error("[BIM::IFC] step_error ifc_model_id=#{ifc_model.id} step=#{ext} duration_ms=#{duration_ms} exitstatus=#{status.exitstatus} output=#{summarize_output(out)}")
          raise "Failed to convert #{filename} to #{ext}: #{out}"
        end

        Rails.logger.info("[BIM::IFC] step_success ifc_model_id=#{ifc_model.id} step=#{ext} duration_ms=#{duration_ms}")

        target_file
      end

      def change_basename(from, to, ext)
        to = Pathname(to)

        Pathname(from).parent.join(to.basename.to_s.sub(to.extname, ext))
      end

      def ensure_executable!(path)
        unless File.file?(path)
          raise I18n.t("ifc_models.conversion.missing_commands", names: "IfcConvert (#{path})")
        end

        return if File.executable?(path)

        begin
          File.chmod(0o755, path)
        rescue StandardError => e
          raise "IfcConvert exists but is not executable at #{path}: #{e.message}"
        end

        return if File.executable?(path)

        raise "IfcConvert exists but is not executable at #{path}"
      end

      def working_directory=(dir)
        @working_directory = dir
      end

      def working_directory
        @working_directory
      end

      def elapsed_ms_since(started_at)
        ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round(2)
      end

      def summarize_output(output, max_len = 600)
        text = output.to_s.gsub(/\s+/, " ").strip
        return text if text.length <= max_len

        "#{text[0, max_len]}...(truncated)"
      end

      def ensure_persisted_conversion_attachments!
        ifc_model.reload

        missing = []
        missing << "xkt" if ifc_model.xkt_attachment.blank?
        missing << "metadata" if ifc_model.metadata_attachment.blank?
        return if missing.empty?

        raise "Conversion finished without persisted #{missing.join(' and ')} attachment(s)"
      end

      def update_progress(progress:, step:, status: nil, clear_error: false, error_message: nil)
        attrs = {
          conversion_progress: progress.to_i.clamp(0, 100),
          conversion_step: step,
          updated_at: Time.current
        }

        if status
          attrs[:conversion_status] = ::Bim::IfcModels::IfcModel.conversion_statuses.fetch(status.to_s)
        end

        attrs[:conversion_error_message] = nil if clear_error
        attrs[:conversion_error_message] = error_message if error_message

        ifc_model.update_columns(attrs)
        ifc_model.assign_attributes(attrs.except(:updated_at))
      end
    end
  end
end
