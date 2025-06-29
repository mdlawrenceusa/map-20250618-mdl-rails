#!/usr/bin/env ruby

# Seeds for calling schedule system
puts "🕒 Seeding Calling Schedule Data..."

# Clear existing calling schedules
CallingSchedule.destroy_all
puts "  Cleared existing calling schedules"

# Create optimal calling windows
calling_schedules = [
  # Tuesday Morning
  {
    day_of_week: 2, # Tuesday
    start_time: Time.parse('09:00:00'),
    end_time: Time.parse('11:30:00'),
    name: 'Tuesday Morning Window',
    description: 'Optimal morning calling time for pastors',
    enabled: true
  },
  
  # Tuesday Afternoon
  {
    day_of_week: 2, # Tuesday
    start_time: Time.parse('13:30:00'),
    end_time: Time.parse('16:00:00'),
    name: 'Tuesday Afternoon Window',
    description: 'Optimal afternoon calling time for pastors',
    enabled: true
  },
  
  # Wednesday Morning
  {
    day_of_week: 3, # Wednesday
    start_time: Time.parse('09:00:00'),
    end_time: Time.parse('11:30:00'),
    name: 'Wednesday Morning Window',
    description: 'Optimal morning calling time for pastors',
    enabled: true
  },
  
  # Wednesday Afternoon (ends at 4 PM due to evening service prep)
  {
    day_of_week: 3, # Wednesday
    start_time: Time.parse('13:30:00'),
    end_time: Time.parse('16:00:00'),
    name: 'Wednesday Afternoon Window',
    description: 'Afternoon calling before evening service prep',
    enabled: true
  },
  
  # Thursday Morning
  {
    day_of_week: 4, # Thursday
    start_time: Time.parse('09:00:00'),
    end_time: Time.parse('11:30:00'),
    name: 'Thursday Morning Window',
    description: 'Optimal morning calling time for pastors',
    enabled: true
  },
  
  # Thursday Afternoon
  {
    day_of_week: 4, # Thursday
    start_time: Time.parse('13:30:00'),
    end_time: Time.parse('16:00:00'),
    name: 'Thursday Afternoon Window',
    description: 'Optimal afternoon calling time for pastors',
    enabled: true
  }
]

calling_schedules.each do |schedule_data|
  schedule = CallingSchedule.create!(schedule_data)
  puts "  ✅ Created #{schedule.name}: #{schedule.day_name} #{schedule.time_range}"
end

puts "\n📊 Calling Schedule Summary:"
puts "  Total calling windows: #{CallingSchedule.count}"
puts "  Optimal calling days: #{CallingSchedule::OPTIMAL_DAYS.map { |d| CallingSchedule::DAYS[d] }.join(', ')}"

# Calculate total weekly calling hours
total_hours = 0
CallingSchedule::OPTIMAL_DAYS.each do |day|
  day_windows = CallingSchedule.for_day(day)
  day_hours = day_windows.sum do |window|
    start_minutes = window.start_time.hour * 60 + window.start_time.min
    end_minutes = window.end_time.hour * 60 + window.end_time.min
    (end_minutes - start_minutes) / 60.0
  end
  total_hours += day_hours
  
  day_name = CallingSchedule::DAYS[day]
  puts "  #{day_name}: #{day_hours} hours (#{day_windows.count} windows)"
end

puts "  Total weekly calling hours: #{total_hours}"

# Update existing leads with calling schedule fields
puts "\n👥 Updating existing leads..."
leads_updated = 0

Lead.find_each do |lead|
  if lead.phone.present?
    # Calculate next available call time for each lead
    next_call_time = CallingSchedule.next_available_calling_time
    
    lead.update_columns(
      calling_schedule_enabled: true,
      time_zone: 'EST',
      next_available_call_time: next_call_time
    )
    
    leads_updated += 1
  else
    # Disable calling for leads without phone numbers
    lead.update_column(:calling_schedule_enabled, false)
  end
end

puts "  ✅ Updated #{leads_updated} callable leads"
puts "  📞 Callable leads: #{Lead.callable.count}"
puts "  🚫 Non-callable leads: #{Lead.where(calling_schedule_enabled: false).count}"

# Display current calling window status
puts "\n🕐 Current Calling Window Status:"
status = CallingWindowService.current_status

puts "  Current time: #{status[:current_time]}"
puts "  Calling allowed: #{status[:calling_allowed] ? '✅ YES' : '❌ NO'}"
puts "  Queue size: #{status[:queue_size]} pending calls"

if status[:next_window]
  puts "  Next window: #{status[:next_window][:formatted]}"
  puts "  Hours away: #{status[:next_window][:hours_away]}"
end

puts "\n🎯 Today's Calling Windows:"
status[:active_windows].each do |window|
  status_icon = if window[:active]
                  '🟢 ACTIVE'
                elsif window[:upcoming]
                  '🟡 UPCOMING'
                else
                  '🔴 PAST'
                end
  
  puts "  #{status_icon} #{window[:name]}: #{window[:formatted]}"
end

# Create some sample calling queue data for analytics testing
puts "\n📞 Creating sample calling queue data..."

# Only create if we have leads and no existing queue
if Lead.callable.any? && CallingQueue.count == 0
  sample_leads = Lead.callable.limit(10)
  queue_count = 0
  
  sample_leads.each_with_index do |lead, index|
    # Create calls with different statuses and times
    status = case index % 4
             when 0 then 'completed'
             when 1 then 'failed'
             when 2 then 'pending'
             else 'processing'
             end
    
    # Some calls during optimal times, some not
    time_offset = if index.even?
                    # Optimal time (Tuesday 10 AM)
                    1.day.ago.beginning_of_week + 1.day + 10.hours
                  else
                    # Non-optimal time (Monday 8 PM)
                    1.day.ago.beginning_of_week + 20.hours
                  end
    
    queue_item = CallingQueue.create!(
      lead: lead,
      scheduled_call_time: time_offset,
      priority: (index % 3) + 1,
      status: status,
      attempt_count: index % 3 + 1,
      notes: "Sample call for #{lead.name}",
      last_attempt_at: (status != 'pending') ? time_offset + 5.minutes : nil
    )
    
    queue_count += 1
  end
  
  puts "  ✅ Created #{queue_count} sample queue items"
  puts "  📊 Queue summary:"
  puts "    Pending: #{CallingQueue.pending.count}"
  puts "    Completed: #{CallingQueue.completed.count}"
  puts "    Failed: #{CallingQueue.failed.count}"
  puts "    Processing: #{CallingQueue.where(status: 'processing').count}"
else
  puts "  ℹ️  Skipped sample data creation (leads: #{Lead.callable.count}, existing queue: #{CallingQueue.count})"
end

puts "\n✨ Calling schedule system initialized successfully!"
puts "📝 Use CallingWindowService.current_status to check calling windows"
puts "📞 Use lead.schedule_call to add leads to the calling queue"
puts "⚡ Use CallingWindowService.process_queue to process pending calls"
puts "📊 Visit /admin/calling_schedule for the admin dashboard"