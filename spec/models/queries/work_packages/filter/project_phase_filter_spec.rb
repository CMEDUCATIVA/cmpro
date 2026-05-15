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

RSpec.describe Queries::WorkPackages::Filter::ProjectPhaseFilter do
  it_behaves_like "basic query filter" do
    let(:type) { :list_optional }
    let(:class_key) { :project_phase_definition_id }
    current_user { build_stubbed(:user) }

    context "with feature flag being active", with_flag: { stages_and_gates: true } do
      context "with the permission to view project phases" do
        before do
          mock_permissions_for(current_user, &:allow_everything)
          login_as(current_user)
        end

        describe "#available?" do
          context "with existing phases" do
            before do
              create(:project_phase_definition)
            end

            it "is true" do
              expect(instance).to be_available
            end
          end

          context "without existing phases" do
            it "is false" do
              expect(instance).not_to be_available
            end
          end
        end

        describe "#allowed_values" do
          context "with existing phases" do
            let!(:definition) { create(:project_phase_definition) }
            let!(:other_definition) { create(:project_phase_definition) }
            let!(:first_definition) { create(:project_phase_definition, position: 0) }

            it "returns an array of phase definition options, ordered by position" do
              expect(instance.allowed_values)
                .to contain_exactly([first_definition.name, first_definition.id.to_s],
                                    [definition.name, definition.id.to_s],
                                    [other_definition.name, other_definition.id.to_s])
            end
          end

          context "without existing phases" do
            it "returns an empty array" do
              expect(instance.allowed_values)
                .to be_empty
            end
          end
        end

        describe "#value_objects" do
          let(:definition1) { create(:project_phase_definition) }
          let(:definition2) { create(:project_phase_definition) }

          before do
            instance.values = [definition1.id.to_s, definition2.id.to_s]
          end

          it "returns an array of types" do
            expect(instance.value_objects)
              .to contain_exactly(definition1, definition2)
          end
        end
      end

      context "without the permission to view project phases" do
        describe "#available?" do
          context "with existing phases" do
            before do
              create(:project_phase_definition)
            end

            it "is false" do
              expect(instance).not_to be_available
            end
          end

          context "without existing phases" do
            it "is false" do
              expect(instance).not_to be_available
            end
          end
        end

        describe "#allowed_values" do
          context "with existing phases" do
            let!(:definition) { create(:project_phase_definition) }
            let!(:other_definition) { create(:project_phase_definition) }
            let!(:first_definition) { create(:project_phase_definition, position: 0) }

            it "returns an empty array" do
              expect(instance.allowed_values)
                .to be_empty
            end
          end

          context "without existing phases" do
            it "returns an empty array" do
              expect(instance.allowed_values)
                .to be_empty
            end
          end
        end
      end
    end

    context "with feature flag being inactive" do
      context "with existing phases" do
        let!(:definition) { create(:project_phase_definition) }
        let!(:other_definition) { create(:project_phase_definition) }
        let!(:first_definition) { create(:project_phase_definition, position: 0) }

        before do
          create(:project_phase_definition)
        end

        describe "#available?" do
          it "is false" do
            expect(instance).not_to be_available
          end
        end

        describe "#allowed_values" do
          it "returns an empty array" do
            expect(instance.allowed_values)
              .to be_empty
          end
        end
      end

      context "without existing phases" do
        describe "#available?" do
          it "is false" do
            expect(instance).not_to be_available
          end
        end

        describe "#allowed_values" do
          it "returns an empty array" do
            expect(instance.allowed_values)
              .to be_empty
          end
        end
      end
    end

    describe "#ar_object_filter?" do
      it "is true" do
        expect(instance)
          .to be_ar_object_filter
      end
    end
  end
end
