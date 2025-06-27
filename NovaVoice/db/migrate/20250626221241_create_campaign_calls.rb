class CreateCampaignCalls < ActiveRecord::Migration[8.0]
  def change
    create_table :campaign_calls do |t|
      t.references :campaign, null: false, foreign_key: true
      t.references :lead, null: false, foreign_key: true
      t.string :call_uuid
      t.string :phone_number
      t.string :status
      t.integer :attempt_number
      t.datetime :scheduled_for
      t.datetime :called_at
      t.text :error_message

      t.timestamps
    end
  end
end
