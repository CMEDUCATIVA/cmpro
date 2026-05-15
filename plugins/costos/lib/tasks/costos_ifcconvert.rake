# frozen_string_literal: true

namespace :costos do
  namespace :ifcconvert do
    desc "Ensure IfcConvert inside plugin before asset precompile"
    task ensure_plugin_binary: :environment do
      next if ENV["COSTOS_SKIP_IFCCONVERT_AUTO"].to_s == "1"

      flow_log = ENV["COSTOS_IFC_FLOW_LOG"].presence || "/opt/openproject/log/costos_ifcconvert_flow.log"
      script = Rails.root.join("plugins", "costos", "scripts", "auto_ensure_ifcconvert_plugin.sh")
      unless File.exist?(script)
        puts "[costos] ifcconvert auto-ensure script not found at #{script}, skipping"
        Rails.logger.warn("[costos] ifcconvert auto-ensure script not found at #{script}, skipping")
        next
      end

      puts "[costos] running IfcConvert auto-ensure..."
      Rails.logger.info("[costos] running IfcConvert auto-ensure script=#{script} flow_log=#{flow_log}")
      env = {
        "COSTOS_IFC_FLOW_LOG" => flow_log,
        "AUTO_INSTALL_DEPS" => ENV.fetch("AUTO_INSTALL_DEPS", "0"),
        "IFCOPENSHELL_AUTO_CLONE" => ENV.fetch("IFCOPENSHELL_AUTO_CLONE", "1")
      }

      ok = system(env, "bash", script.to_s)
      raise "[costos] IfcConvert auto-ensure failed" unless ok
      Rails.logger.info("[costos] IfcConvert auto-ensure completed")
    end
  end
end

Rake::Task["assets:precompile"].enhance(["costos:ifcconvert:ensure_plugin_binary"])
