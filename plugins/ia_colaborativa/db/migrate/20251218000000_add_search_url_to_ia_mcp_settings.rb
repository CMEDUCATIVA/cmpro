class AddSearchUrlToIaMcpSettings < ActiveRecord::Migration[6.1]
  def change
    add_column :ia_mcp_settings, :search_url, :string
  end
end
