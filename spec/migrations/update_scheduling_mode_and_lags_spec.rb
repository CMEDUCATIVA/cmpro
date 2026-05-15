# frozen_string_literal: true

#-- copyright
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

require "spec_helper"
require Rails.root.join("db/migrate/20241120095318_update_scheduling_mode_and_lags.rb")

RSpec.describe UpdateSchedulingModeAndLags, type: :model do
  # Silencing migration logs, since we are not interested in that during testing
  subject(:run_migration) do
    perform_enqueued_jobs do
      ActiveRecord::Migration.suppress_messages { described_class.new.up }
    end
    table_work_packages.map(&:reload) if defined?(table_work_packages)
  end

  shared_let(:author) { create(:user) }
  shared_let(:priority) { create(:priority, name: "Normal") }
  shared_let(:project) { create(:project, name: "Main project") }
  shared_let(:status_new) { create(:status, name: "New") }

  before_all do
    set_factory_default(:user, author)
    set_factory_default(:priority, priority)
    set_factory_default(:project, project)
    set_factory_default(:project_with_types, project)
    set_factory_default(:status, status_new)
  end

  describe "journal creation" do
    context "when scheduling mode is changed by the migration" do
      let_work_packages(<<~TABLE)
        subject           | scheduling mode
        wp already manual | manual
        wp automatic      | automatic
      TABLE

      it "creates a journal entry only for the changed work packages" do
        expect(wp_already_manual.journals.count).to eq(1)
        expect(wp_automatic.journals.count).to eq(1)
        expect(wp_automatic.lock_version).to eq(0)

        run_migration

        expect(wp_already_manual.journals.count).to eq(1)
        expect(wp_automatic.journals.count).to eq(2)

        expect(wp_automatic.last_journal.get_changes)
          .to include("schedule_manually" => [false, true],
                      "cause" => [nil, { "feature" => "scheduling_mode_adjusted", "type" => "system_update" }])

        aggregate_failures "the journal author is the system user" do
          journal = wp_automatic.last_journal
          expect(journal.user).to eq(User.system)
        end

        aggregate_failures "the lock_version of the work package is incremented" do
          expect(wp_automatic.lock_version).to be > 0
        end

        aggregate_failures "changes the updated_at of the work package" do
          expect(wp_automatic.updated_at).not_to eq(wp_automatic.created_at)
          expect(wp_automatic.updated_at).to be > wp_automatic.created_at

          first_journal, last_journal = wp_automatic.journals
          expect(wp_automatic.updated_at).not_to eq(first_journal.updated_at)
          expect(wp_automatic.updated_at).to eq(last_journal.updated_at)
        end
      end
    end
  end

  # spec from #59539, "Migration from an earlier version" section:
  #
  # > - For work packages with no predecessors (or with no relations at all), they will be
  # >   switched to manual scheduling.
  context "for work packages with no predecessors nor children" do
    let_work_packages(<<~TABLE)
      subject        | start date | due date   | scheduling mode
      wp automatic 1 | 2024-11-20 | 2024-11-21 | automatic
      wp automatic 2 |            | 2024-11-21 | automatic
      wp automatic 3 | 2024-11-20 |            | automatic
      wp automatic 4 |            |            | automatic
      wp manual 1    | 2024-11-20 | 2024-11-21 | manual
      wp manual 2    |            | 2024-11-21 | manual
      wp manual 3    | 2024-11-20 |            | manual
      wp manual 4    |            |            | manual
    TABLE

    it "switches to manual scheduling" do
      run_migration

      expect(table_work_packages).to all(be_schedule_manually)
    end
  end

  # spec from #59539, "Migration from an earlier version" section:
  #
  # > - Manually scheduled work packages remain so.
  context "for manually scheduled work packages following another one" do
    let_work_packages(<<~TABLE)
      subject        | start date | due date   | scheduling mode | predecessors
      main           |            |            | manual          |
      wp 1           | 2024-11-20 | 2024-11-21 | manual          | follows main
      wp 2           |            | 2024-11-21 | manual          | follows main
      wp 3           | 2024-11-20 |            | manual          | follows main
      wp 4           |            |            | manual          | follows main
    TABLE

    it "remains manually scheduled" do
      run_migration

      expect(table_work_packages).to all(be_schedule_manually)
    end
  end

  # spec from #59539, "Migration from an earlier version" section
  #
  # > - If the successor is in automatic scheduling mode, has dates and some predecessors
  # >   have dates too:
  # >   - The successor remains in automatic mode
  context "for automatically scheduled work packages following another one having dates" do
    let_work_packages(<<~TABLE)
      subject            | start date | due date   | scheduling mode | predecessors
      pred with dates    | 2024-11-19 | 2024-11-19 | manual          |
      pred without dates |            |            | manual          |
      wp 1               | 2024-11-20 | 2024-11-21 | automatic       | follows pred with dates, follows pred without dates
      wp 2               |            | 2024-11-21 | automatic       | follows pred with dates, follows pred without dates
      wp 3               | 2024-11-20 |            | automatic       | follows pred with dates, follows pred without dates
      wp 4               |            |            | automatic       | follows pred with dates, follows pred without dates
    TABLE

    it "remains automatically scheduled" do
      run_migration

      expect([wp1, wp2, wp3, wp4]).to all(be_schedule_automatically)
    end
  end

  # spec from #59539, "Migration from an earlier version" section
  # > - If the successor is in automatic scheduling mode and has no dates
  # >   - The successor remains in automatic mode and continues to have no dates,
  # >     regardless of having predecessor with dates or not.
  # > - If the successor is in automatic scheduling mode, has dates and none of the
  # >   predecessors have any dates
  # >   - The successor is switched to manual mode to preserve its dates and duration
  context "for automatically scheduled work packages without dates following another one" do
    let_work_packages(<<~TABLE)
      subject            | start date | due date   | scheduling mode | predecessors
      pred without dates |            |            | manual          |
      succ               |            |            | automatic       | follows pred without dates
    TABLE

    it "remains automatically scheduled and continues to have no dates" do
      run_migration

      expect(succ).to be_schedule_automatically
    end
  end

  # spec from #59539, "Migration from an earlier version" section
  #
  # > - If the successor is in automatic scheduling mode, has dates and none of the
  # >   predecessors have any dates
  # >   - The successor is switched to manual mode to preserve its dates and duration
  context "for automatically scheduled work packages following another one having no dates" do
    let_work_packages(<<~TABLE)
      subject            | start date | due date   | scheduling mode | predecessors
      pred without dates |            |            | manual          |
      succ 1             | 2024-11-20 | 2024-11-21 | automatic       | follows pred without dates
      succ 2             |            | 2024-11-21 | automatic       | follows pred without dates
      succ 3             | 2024-11-20 |            | automatic       | follows pred without dates
    TABLE

    it "switches to manual scheduling to preserve its dates and duration" do
      run_migration

      expect([succ1, succ2, succ3]).to all(be_schedule_manually)
    end
  end

  # spec from #42388, "Migration from an earlier version" section
  #
  # > - Manually scheduled work packages remain so.
  # > - If the relationship is parent-child, there are no changes to dates; the parent
  # >   remains in automatic mode.
  context "for parent work packages" do
    let_work_packages(<<~TABLE)
      hierarchy        | scheduling mode |
      parent_automatic | automatic       |
        child1         | manual          |
      parent_manual    | manual          |
        child2         | manual          |
    TABLE

    it "keep their scheduling mode" do
      run_migration

      expect(parent_automatic).to be_schedule_automatically
      expect(parent_manual).to be_schedule_manually
    end
  end

  context "for 2 work packages following each other with distant dates" do
    shared_let_work_packages(<<~TABLE)
      subject       | MTWTFSS | scheduling mode | predecessors
      predecessor 1 | XX      | manual          |
      follower 1    |      XX | automatic       | follows predecessor 1

      # only start dates
      predecessor 2 |  [      | manual          |
      follower 2    |      [  | automatic       | follows predecessor 2

      # only due dates
      # if lag is already set, it's overwritten
      predecessor 3 |  ]      | manual          |
      follower 3    |      ]  | automatic       | follows predecessor 3 with lag 2
    TABLE

    it "sets a lag to the relation to ensure the distance is kept" do
      run_migration

      expect(follower1).to be_schedule_automatically
      relations = _table.relations.map(&:reload)
      expect(relations.map(&:lag)).to all(eq(3))
    end

    context "when there are non-working days between the dates" do
      before do
        # Wednesday is a recurring non-working day
        set_non_working_week_days("wednesday")
        # Thursday is a fixed non-working day
        thursday = Date.current.next_occurring(:monday) + 3.days
        create(:non_working_day, date: thursday)
      end

      it "computes the lag correctly by excluding non-working days" do
        run_migration

        expect(follower1).to be_schedule_automatically
        relations = _table.relations.map(&:reload)
        expect(relations.map(&:lag)).to all(eq(1))
      end
    end
  end

  context "for 2 work packages following each other with missing dates" do
    let_work_packages(<<~TABLE)
      subject       | MTWTFSS | scheduling mode | predecessors
      # only predecessor has dates
      predecessor 1 | XX      | manual          |
      follower 1    |         | automatic       | follows predecessor 1

      # only successor has dates
      predecessor 2 |         | manual          |
      follower 2    |      XX | automatic       | follows predecessor 2

      # none have dates
      predecessor 3 |         | manual          |
      follower 3    |         | automatic       | follows predecessor 3 with lag 2
    TABLE

    it "does not change the existing lag" do
      run_migration

      expect(follower1).to be_schedule_automatically
      relations = _table.relations.map(&:reload)
      expect(relations.map(&:lag)).to eq([0, 0, 2])
    end
  end

  context "for a work package following multiple work packages" do
    shared_let_work_packages(<<~TABLE)
      subject       | MTWTFSS | scheduling mode | predecessors
      predecessor 1 | XX      | manual          |
      predecessor 2 |  XX     | manual          |
      predecessor 3 | X       | manual          |
      follower      |      XX | automatic       | follows predecessor 1, follows predecessor 2, follows predecessor 3
    TABLE

    it "sets a lag only to the closest relation" do
      run_migration

      relations = _table.relations.map(&:reload)
      expect(relations.map(&:lag)).to eq([0, 2, 0])
    end
  end
end
