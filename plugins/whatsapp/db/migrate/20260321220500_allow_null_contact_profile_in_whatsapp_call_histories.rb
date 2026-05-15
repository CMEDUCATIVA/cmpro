class AllowNullContactProfileInWhatsappCallHistories < ActiveRecord::Migration[7.0]
  def change
    change_column_null :whatsapp_call_histories, :contact_profile_id, true
  end
end
