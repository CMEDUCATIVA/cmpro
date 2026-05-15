class AddBasicAuthToIaMcpSettings < ActiveRecord::Migration[6.1]
  def change
    add_column :ia_mcp_settings, :username, :string
    add_column :ia_mcp_settings, :password, :string
  end
end
