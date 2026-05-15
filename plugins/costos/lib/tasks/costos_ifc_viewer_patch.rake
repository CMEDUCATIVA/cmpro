# frozen_string_literal: true

def run_costos_patch(script)
  direct = system("bash", script.to_s)
  return true if direct

  system("sudo", "-n", "bash", script.to_s)
end

namespace :costos do
  namespace :core_patch do
    desc "Apply core patch bundle before asset precompile"
    task apply: :environment do
      next if ENV["COSTOS_SKIP_CORE_PATCH_AUTO"].to_s == "1"

      plugin_root = Rails.root.join("plugins", "costos")
      apply_script = plugin_root.join("scripts", "apply_core_patch.sh")
      verify_script = plugin_root.join("scripts", "verify_core_patch.sh")

      unless File.exist?(apply_script)
        raise "[costos] Core patch script not found: #{apply_script}"
      end

      unless File.exist?(verify_script)
        raise "[costos] Core verify script not found: #{verify_script}"
      end

      puts "[costos] applying core patch before assets:precompile..."
      Rails.logger.info("[costos] applying core patch script=#{apply_script}")

      ok = run_costos_patch(apply_script)
      unless ok
        raise <<~MSG
          [costos] Core patch failed.
          [costos] If the patch needs elevated permissions, install sudoers once with:
          [costos]   bash /opt/openproject/plugins/costos/scripts/install_core_patch_sudoers.sh
        MSG
      end

      ok = run_costos_patch(verify_script)
      unless ok
        raise <<~MSG
          [costos] Core verification failed.
          [costos] Verify sudo -n access for:
          [costos]   /bin/bash /opt/openproject/plugins/costos/scripts/verify_core_patch.sh
        MSG
      end

      Rails.logger.info("[costos] Core patch applied and verified")
    end
  end
end

Rake::Task.define_task("assets:precompile")

assets_precompile_task = Rake::Task["assets:precompile"]
original_prerequisites = assets_precompile_task.prerequisites.dup
original_actions = assets_precompile_task.actions.dup

assets_precompile_task.clear
assets_precompile_task.enhance(["costos:core_patch:apply"] + original_prerequisites)
original_actions.each do |action|
  assets_precompile_task.enhance(&action)
end
