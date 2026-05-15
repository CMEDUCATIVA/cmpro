class AddRenderTokensToEmailDeliveries < ActiveRecord::Migration[6.1]
  def change
    add_column :email_deliveries, :render_tokens, :boolean, null: false, default: true
  end
end
