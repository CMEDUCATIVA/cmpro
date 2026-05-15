# frozen_string_literal: true

#
# OpenProject is an open source project management software.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
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
#++

class MergeLifecycleSteps < ActiveRecord::Migration[8.0]
  def change
    reversible do |direction|
      direction.up do
        delete_life_cycle_project_queries
        delete_life_cycles

        rename_permissions("view_project_stages_and_gates", "view_project_phases")
        rename_permissions("select_project_life_cycle", "select_project_phases")
        rename_permissions("edit_project_stages_and_gates", "edit_project_phases")
      end
      direction.down do
        rename_permissions("view_project_phases", "view_project_stages_and_gates")
        rename_permissions("select_project_phases", "select_project_life_cycle")
        rename_permissions("edit_project_phases", "edit_project_stages_and_gates")
      end
    end

    adapt_tables
    rename_tables
  end

  def delete_life_cycles
    # The feature is behind a feature flag and not yet released.
    # Potential data is thus simply removed and the seeder will add the updated data.
    execute <<-SQL.squish
      DELETE FROM project_life_cycle_steps;
    SQL

    execute <<-SQL.squish
      DELETE FROM project_life_cycle_step_definitions;
    SQL

    execute <<-SQL.squish
      DELETE FROM project_life_cycle_step_journals;
    SQL
  end

  def delete_life_cycle_project_queries
    step_ids = select_all(<<-SQL.squish).to_a.flatten.flat_map(&:values)
      SELECT id from project_life_cycle_step_definitions;
    SQL

    if step_ids.any?
      # This should be possible to be done like with orders and filters
      execute <<-SQL.squish
        DELETE
        FROM project_queries
        WHERE selects::jsonb ?| array[#{step_ids.map { |id| "'lcsd_#{id}'" }.join(',')}];
      SQL
    end

    execute <<-SQL.squish
      DELETE
      FROM project_queries
      WHERE jsonb_path_exists(orders::jsonb, '$[*] ? (@.attribute like_regex "^lcsd.*")');
    SQL

    execute <<-SQL.squish
      DELETE
      FROM project_queries
      WHERE jsonb_path_exists(filters::jsonb, '$[*] ? (@.attribute like_regex "^lcsd.*")');
    SQL
  end

  def adapt_tables
    change_table(:project_life_cycle_step_definitions, bulk: true) do |t|
      t.column :start_gate, :boolean, default: false, null: false
      t.column :start_gate_name, :string
      t.column :finish_gate, :boolean, default: false, null: false
      t.column :finish_gate_name, :string

      t.remove :type, type: :string
    end

    change_table(:project_life_cycle_steps) do |t|
      t.remove :type, type: :string
      t.rename :end_date, :finish_date
    end

    change_table(:project_life_cycle_step_journals) do |t|
      t.rename :life_cycle_step_id, :phase_id
      t.rename :end_date, :finish_date
    end

    change_table(:work_packages) do |t|
      t.rename :project_life_cycle_step_id, :project_phase_id
    end
  end

  def rename_tables
    rename_table :project_life_cycle_step_definitions, :project_phase_definitions
    rename_table :project_life_cycle_steps, :project_phases
    rename_table :project_life_cycle_step_journals, :project_phase_journals
  end

  def rename_permissions(old, new)
    execute <<-SQL.squish
      UPDATE role_permissions
      SET permission = '#{new}'
      WHERE permission = '#{old}'
    SQL
  end
end
