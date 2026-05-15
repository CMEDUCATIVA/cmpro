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

RSpec.describe "Document categories", :js do
  shared_let(:admin) { create(:admin) }

  before do
    login_as(admin)
  end

  it "allows creating new document categories" do
    visit admin_settings_document_categories_path

    page.find_test_selector("add-enumeration-button").click

    fill_in "Name", with: "Documentation"
    click_on("Save")

    # we are redirected back to the index page
    expect(page).to have_current_path(admin_settings_document_categories_path)
    expect(page).to have_content("Documentation")

    # It allows editing (Regression #62459)
    click_link "Documentation"

    fill_in "Name", with: "Specification"
    click_on("Save")

    expect(page).to have_current_path(admin_settings_document_categories_path)
    expect(page).to have_content("Specification")

    expect(DocumentCategory).to exist(name: "Specification")
    expect(DocumentCategory).not_to exist(name: "Documentation")
  end

  context "with uploaded documents" do
    let(:project) { create(:project) }
    let(:category1) { create(:document_category, name: "Category 1", project:) }
    let(:category2) { create(:document_category, name: "Category 2", project:) }

    it "can group by category and date (regression #64134)" do
      # Add documents to the category
      create_list(:document, 2, category: category1, project:)
      create_list(:document, 2, category: category2, project:)

      # Visit the documents module
      visit project_documents_path(project.identifier)

      # Expect grouping to be applied by category
      expect(page).to have_css(".CollapsibleSection h2", text: "Category 1")
      expect(page).to have_css(".CollapsibleSection h2", text: "Category 2")

      # Change grouping to "date"
      within "#sidebar" do
        choose(I18n.t(:label_date))
      end

      wait_for_reload

      # Expect grouping to be changed
      expect(page).to have_css(".CollapsibleSection h2", text: Time.zone.today)
      expect(page).to have_no_css(".CollapsibleSection h2", text: "Category 1")
      expect(page).to have_no_css(".CollapsibleSection h2", text: "Category 2")
    end
  end
end
