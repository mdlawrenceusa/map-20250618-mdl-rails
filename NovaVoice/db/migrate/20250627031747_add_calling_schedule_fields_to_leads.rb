class AddCallingScheduleFieldsToLeads < ActiveRecord::Migration[8.0]
  def change
    add_column :leads, :calling_schedule_enabled, :boolean, default: true, null: false
    add_column :leads, :time_zone, :string, default: 'EST', null: false
    add_column :leads, :last_call_attempt, :datetime
    add_column :leads, :next_available_call_time, :datetime
    
    add_index :leads, :calling_schedule_enabled
    add_index :leads, :next_available_call_time
  end
end
