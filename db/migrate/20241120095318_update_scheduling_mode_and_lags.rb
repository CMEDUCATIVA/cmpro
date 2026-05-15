# frozen_string_literal: true

class UpdateSchedulingModeAndLags < ActiveRecord::Migration[7.1]
  def up
    change_column_default :work_packages, :schedule_manually, from: false, to: true
    execute "UPDATE work_packages SET schedule_manually = false WHERE schedule_manually IS NULL"
    change_column_null :work_packages, :schedule_manually, false

    migration_job = WorkPackages::AutomaticMode::MigrateValuesJob
    if Rails.env.development?
      migration_job.perform_now
    else
      migration_job.perform_later
    end
  end

  def down
    change_column_default :work_packages, :schedule_manually, from: true, to: false
    # Keep the not-null constraint when rolling back
    change_column_null :work_packages, :schedule_manually, false
  end
end
