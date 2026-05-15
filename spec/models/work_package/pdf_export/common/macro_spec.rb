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

RSpec.describe WorkPackage::PDFExport::Common::Macro do
  let(:work_package) do
    create(:work_package, id: 185, subject: "Work package 1")
  end
  let(:markdown) { "" }
  let(:formatter) { Class.new { extend WorkPackage::PDFExport::Common::Macro } }

  subject(:formatted) do
    formatter.apply_markdown_field_macros(markdown, { work_package: work_package, user: User.current })
  end

  describe "empty text" do
    it "contains correct data" do
      expect(formatted).to eq ""
    end
  end

  describe "wp mention tag" do
    let(:markdown) { '<mention class="mention" data-id="185" data-type="work_package" data-text="#185">#185</mention>' }

    it "ignores the tag" do
      expect(formatted).to eq("<mention class=\"mention\" data-id=\"185\" " +
                              "data-type=\"work_package\" data-text=\"#185\">\\#185</mention>\n")
    end
  end

  describe "wp mention plain" do
    let(:markdown) { "#185" }

    it "contains correct data" do
      expect(formatted).to eq("<mention class=\"mention\" data-id=\"185\" " +
                              "data-type=\"work_package\" data-text=\"#185\">#185</mention>\n")
    end
  end

  describe "wp mention with markdown formating bold" do
    let(:markdown) { "\n**#185**\n" }

    it "contains correct data" do
      expect(formatted).to eq("**<mention class=\"mention\" data-id=\"185\" " +
                              "data-type=\"work_package\" data-text=\"#185\">#185</mention>**\n")
    end
  end

  describe "wp mention with markdown formating strikethrough" do
    let(:markdown) { "~~#185~~" }

    it "contains correct data" do
      expect(formatted).to eq("~~<mention class=\"mention\" data-id=\"185\" " +
                              "data-type=\"work_package\" data-text=\"#185\">#185</mention>~~\n")
    end
  end

  describe "wp mention with strikethrough in table" do
    let(:markdown) { "<table><tr><td><p><s>##185</s></p></td></tr></table>" }

    it "contains correct data" do
      expect(formatted).to eq("<table><tr><td><p><s><mention class=\"mention\" data-id=\"185\" " +
                              "data-type=\"work_package\" data-text=\"##185\">##185</mention></s></p></td></tr></table>\n")
    end
  end
end
