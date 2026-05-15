class CreateIaMcpSettings < ActiveRecord::Migration[6.1]
  def change
    create_table :ia_mcp_settings do |t|
      t.string :url

      t.timestamps
    end
  end
end
