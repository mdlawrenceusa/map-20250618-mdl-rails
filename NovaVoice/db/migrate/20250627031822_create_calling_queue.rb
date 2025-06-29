class CreateCallingQueue < ActiveRecord::Migration[8.0]
  def change
    create_table :calling_queues do |t|
      t.references :lead, null: false, foreign_key: true
      t.datetime :scheduled_call_time, null: false
      t.integer :priority, default: 1, null: false
      t.string :status, default: 'pending', null: false
      t.integer :attempt_count, default: 0, null: false
      t.text :notes
      t.datetime :last_attempt_at
      t.text :failure_reason

      t.timestamps
    end
    
    add_index :calling_queues, [:status, :scheduled_call_time]
    add_index :calling_queues, :scheduled_call_time
    add_index :calling_queues, [:lead_id, :status]
  end
end
