class CreateCallingSchedules < ActiveRecord::Migration[8.0]
  def change
    create_table :calling_schedules do |t|
      t.integer :day_of_week, null: false # 0=Sunday, 1=Monday, etc.
      t.time :start_time, null: false
      t.time :end_time, null: false
      t.boolean :enabled, default: true, null: false
      t.string :name, null: false
      t.string :description

      t.timestamps
    end
    
    add_index :calling_schedules, [:day_of_week, :enabled]
    add_index :calling_schedules, :enabled
  end
end
