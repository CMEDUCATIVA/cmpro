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

RSpec.describe EnterpriseToken do
  let(:object) { OpenProject::Token.new domain: Setting.host_name }
  let(:ee_hide_banners) { true }

  subject { described_class.new(encoded_token: "foo") }

  before do
    RequestStore.delete :current_ee_token
    allow(OpenProject::Configuration).to receive(:ee_hide_banners?).and_return(ee_hide_banners)
  end

  describe ".active?" do
    before do
      allow(described_class).to receive(:current).and_return(subject)
      allow(described_class.current).to receive(:token_object).and_return(object)
      subject.save!(validate: false)
    end

    context "with a non expired token" do
      before do
        allow(object).to receive(:expired?).and_return(false)
      end

      it "returns true" do
        expect(described_class.active?).to be(true)
      end
    end

    context "with an expired token" do
      before do
        allow(object).to receive(:expired?).and_return(true)
      end

      it "returns false" do
        expect(described_class.active?).to be(false)
      end
    end
  end

  describe ".hide_banners?" do
    context "when ee manager is visible" do
      let(:ee_hide_banners) { true }

      it "returns true" do
        expect(described_class).to be_hide_banners
      end
    end

    context "when ee manager is not visible" do
      let(:ee_hide_banners) { false }

      it "returns false" do
        expect(described_class).not_to be_hide_banners
      end
    end
  end

  describe ".banner_type_for" do
    before do
      allow(described_class).to receive(:allows_to?).with(:active_feature).and_return(true)
      allow(described_class).to receive(:allows_to?).with(:inactive_feature).and_return(false)
    end

    context "without an EnterpriseToken" do
      before do
        allow(described_class).to receive(:active?).and_return(false)
      end

      it "returns :no_token" do
        expect(described_class.banner_type_for(feature: :active_feature)).to eq(:no_token)
      end
    end

    context "with a feature that is included in the EnterpriseToken" do
      before do
        allow(described_class).to receive(:active?).and_return(true)
      end

      it "returns nil" do
        expect(described_class.banner_type_for(feature: :active_feature)).to be_nil
      end
    end

    context "with a feature that is not included in the EnterpriseToken" do
      before do
        allow(described_class).to receive(:active?).and_return(true)
      end

      it "returns :upsell" do
        expect(described_class.banner_type_for(feature: :inactive_feature)).to eq(:upsell)
      end
    end
  end

  describe "existing token" do
    before do
      allow_any_instance_of(described_class).to receive(:token_object).and_return(object) # rubocop:disable RSpec/AnyInstance
      subject.save!(validate: false)
    end

    context "when inner token is active" do
      it "has an active token" do
        allow(object).to receive(:expired?).and_return(false)
        expect(described_class.count).to eq(1)
        expect(described_class.current).to eq(subject)
        expect(described_class.current.encoded_token).to eq("foo")

        # Deleting it updates the current token
        described_class.current.destroy!

        expect(described_class.count).to eq(0)
        expect(described_class.current).to be_nil
      end

      it "delegates to the token object" do
        allow(object).to receive_messages(
          subscriber: "foo",
          mail: "bar",
          starts_at: Time.zone.today,
          issued_at: Time.zone.today,
          expires_at: "never",
          restrictions: { foo: :bar }
        )

        expect(subject.subscriber).to eq("foo")
        expect(subject.mail).to eq("bar")
        expect(subject.starts_at).to eq(Time.zone.today)
        expect(subject.issued_at).to eq(Time.zone.today)
        expect(subject.expires_at).to eq("never")
        expect(subject.restrictions).to eq(foo: :bar)
      end

      describe "#allows_to?" do
        let(:service_double) { Authorization::EnterpriseService.new(subject) }

        before do
          allow(Authorization::EnterpriseService)
            .to receive(:new)
            .with(subject)
            .and_return(service_double)
        end

        it "forwards to EnterpriseTokenService for checks" do
          allow(service_double)
            .to receive(:call)
            .with(:forbidden_action)
            .and_return ServiceResult.success(result: false)
          allow(service_double)
            .to receive(:call)
            .with(:allowed_action)
            .and_return ServiceResult.success(result: true)

          expect(described_class.allows_to?(:forbidden_action)).to be false
          expect(described_class.allows_to?(:allowed_action)).to be true
        end
      end
    end

    context "when inner token is expired" do
      before do
        allow(object).to receive(:expired?).and_return(true)
      end

      it "has an expired token" do
        expect(described_class.current).to eq(subject)
        expect(described_class).not_to be_active
      end
    end

    context "when updating it with an invalid token" do
      it "fails validations" do
        subject.encoded_token = "bar"
        expect(subject.save).to be_falsey
      end
    end
  end

  describe "no token" do
    it do
      expect(described_class.current).to be_nil
      expect(described_class).not_to be_active
    end
  end

  describe "invalid token" do
    it "appears as if no token is shown" do
      expect(described_class.current).to be_nil
      expect(described_class).not_to be_active
    end
  end

  describe "Configuration file has `ee_hide_banners` set to false" do
    it "does not show banners promoting EE" do
      allow(OpenProject::Configuration).to receive(:ee_hide_banners?).and_return(false)
      expect(described_class).not_to be_hide_banners
    end
  end
end
