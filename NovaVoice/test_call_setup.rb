#!/usr/bin/env ruby

# Test call setup for 347-200-5533
require_relative 'config/environment'

puts "=== SETTING UP TEST CALL ==="
puts

# First, normalize the phone number
phone_number = "+1 (347) 200-5533"
puts "Phone number: #{phone_number}"

# Create or find the test lead
lead = Lead.find_or_create_by(phone: phone_number) do |l|
  l.name = "Test User"
  l.company = "NovaVoice Test"
  l.email = "test@novavoice.ai"
  l.state_province = "NY"
  l.lead_source = "Test"
  l.lead_status = "Open - Not Contacted"
  l.owner_alias = "TEST"
  l.calling_schedule_enabled = true
  l.created_date = Time.current
end

if lead.persisted?
  puts "✓ Lead created/found successfully!"
  puts "  Lead ID: #{lead.id}"
  puts "  Name: #{lead.name}"
  puts "  Phone: #{lead.phone}"
  puts "  Status: #{lead.lead_status}"
else
  puts "✗ Failed to create lead"
  puts "  Errors: #{lead.errors.full_messages.join(', ')}"
  exit 1
end

puts
puts "=== CHECKING CALLING WINDOW ==="
if CallingSchedule.is_valid_calling_time?
  puts "✓ Currently in valid calling window!"
else
  puts "✗ Not in valid calling window"
  puts "  Valid times: Tue-Thu, 9:00 AM - 11:30 AM and 1:30 PM - 4:00 PM EST"
  next_window = CallingSchedule.next_available_calling_time
  puts "  Next window: #{next_window.strftime('%A, %B %d at %I:%M %p %Z')}"
end

puts
puts "=== READY TO INITIATE CALL ==="
puts
puts "To make the test call, run this command:"
puts
puts "curl -X POST http://localhost:3000/call/ai \\"
puts "  -H \"Content-Type: application/json\" \\"
puts "  -d '{"
puts "    \"to\": \"#{phone_number.gsub(/\D/, '').prepend('+')}\","
puts "    \"initialMessage\": \"Hello, this is Esther from Mike Lawrence Productions calling about our Gospel outreach program. Is this a good time to speak with you?\""
puts "  }'"
puts
puts "Or for a simple test call:"
puts
puts "curl -X POST http://localhost:3000/call/simple \\"
puts "  -H \"Content-Type: application/json\" \\"
puts "  -d '{"
puts "    \"to\": \"#{phone_number.gsub(/\D/, '').prepend('+')}\","
puts "    \"message\": \"This is a test call from Nova Voice. The system is working correctly.\""
puts "  }'"