class CreateLeads < ActiveRecord::Migration[8.0]
  def change
    create_table :leads do |t|
      t.string :name
      t.string :company
      t.string :phone
      t.string :website
      t.string :state_province
      t.string :lead_source
      t.string :email
      t.string :lead_status
      t.datetime :created_date
      t.string :owner_alias
      t.boolean :unread_by_owner

      t.timestamps
    end
  end
end
