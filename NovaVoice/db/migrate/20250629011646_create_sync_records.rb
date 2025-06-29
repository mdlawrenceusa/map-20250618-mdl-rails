class CreateSyncRecords < ActiveRecord::Migration[8.0]
  def change
    create_table :sync_records do |t|
      t.string :resource_type
      t.integer :resource_id
      t.string :synced_by
      t.datetime :synced_at
      t.string :environment
      t.text :sync_details

      t.timestamps
    end
  end
end
