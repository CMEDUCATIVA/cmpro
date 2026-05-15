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

require "rails_helper"

RSpec.describe OpenProject::Common::AttributeHelpTextComponent, type: :component do
  include Rails.application.routes.url_helpers

  subject do
    render_inline(described_class.new(help_text:))
    page
  end

  shared_examples "component renders" do
    it "renders a link" do
      expect(subject).to have_link href: show_dialog_attribute_help_text_path(help_text),
                                   class: "Link"
    end

    it "renders a tooltip" do
      expect(subject).to have_element "tool-tip", text: "Show help text",
                                                  for: /attribute-help-text-component-\d+/,
                                                  popover: "manual",
                                                  "data-direction": "sw",
                                                  "data-type": "label"
    end

    it "renders an icon" do
      expect(subject).to have_octicon :question, size: :xsmall
    end

    it "connects an 'async-dialog' controller" do
      expect(subject).to have_element :a, "data-controller": "async-dialog"
    end

    it "applies .op-attribute-help-text class" do
      expect(subject).to have_element :a, class: "op-attribute-help-text"
    end

    it "applies an ID" do
      expect(subject).to have_element :a, id: /attribute-help-text-component-\d+/
    end
  end

  shared_examples "component does not render" do
    it "renders nothing" do
      expect(subject).to have_no_element
    end

    it "does not raise an error" do
      expect { subject }.not_to raise_error
    end
  end

  context "with a project help text" do
    let(:help_text) { build_stubbed(:project_help_text) }

    it_behaves_like "component renders"
  end

  context "with a work package help text" do
    let(:help_text) { build_stubbed(:work_package_help_text) }

    it_behaves_like "component renders"
  end

  context "with nil help text" do
    let(:help_text) { nil }

    it_behaves_like "component does not render"
  end
end
