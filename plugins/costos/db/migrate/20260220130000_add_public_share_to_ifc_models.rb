# frozen_string_literal: true

class AddPublicShareToIfcModels < ActiveRecord::Migration[6.1]
  def change
    add_column :ifc_models, :public_share_enabled, :boolean, default: false, null: false
    add_column :ifc_models, :public_share_token, :string

    add_index :ifc_models, :public_share_token, unique: true
    add_index :ifc_models, :public_share_enabled
  end
end
