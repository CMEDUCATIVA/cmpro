# frozen_string_literal: true

# -- copyright
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
# ++

require "spec_helper"

RSpec.describe "Workflow edit" do
  include Toasts::Expectations

  let(:role) { create(:project_role) }
  let(:type) { create(:type) }
  let(:admin)  { create(:admin) }
  let(:statuses) { (1..3).map { create(:status) } }
  let!(:workflow) do
    create(:workflow, role_id: role.id,
                      type_id: type.id,
                      old_status_id: statuses[0].id,
                      new_status_id: statuses[1].id,
                      author: false,
                      assignee: false)
  end

  current_user { admin }

  before do
    visit url_for(controller: "/workflows", action: :edit)
  end

  it "allows adding another workflow" do
    click_button "Edit"

    within "#workflow_form_always" do
      check "status_#{statuses[1].id}_#{statuses[2].id}_"
    end

    click_button "Save"

    expect_flash(message: "Successful update.")

    within "#workflow_form_always" do
      expect(page)
        .to have_field "status_#{statuses[0].id}_#{statuses[1].id}_", checked: true
      expect(page)
        .to have_field "status_#{statuses[1].id}_#{statuses[2].id}_", checked: true

      expect(page)
        .to have_field "status_#{statuses[0].id}_#{statuses[2].id}_", checked: false
      expect(page)
        .to have_field "status_#{statuses[1].id}_#{statuses[0].id}_", checked: false
      expect(page)
        .to have_field "status_#{statuses[2].id}_#{statuses[0].id}_", checked: false
      expect(page)
        .to have_field "status_#{statuses[2].id}_#{statuses[1].id}_", checked: false
    end
  end
end
