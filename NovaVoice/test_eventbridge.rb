#!/usr/bin/env ruby

# Test EventBridge publisher for NovaVoice
require 'bundler/setup'
require_relative 'config/environment'

puts "🔥 Testing EventBridge Campaign System"
puts "======================================"

# Test the EventBridge publisher directly
publisher = EventBridgePublisher.new

puts "\n📞 Testing single call event..."
begin
  result = publisher.publish_single_call("+13472005533", nil, "test-campaign")
  puts "✅ Single call event published successfully!"
  puts "   Response: #{result}"
rescue => e
  puts "❌ Single call event failed: #{e.message}"
  puts "   Backtrace: #{e.backtrace.first(3).join("\n   ")}"
end

puts "\n📋 Testing campaign creation..."
begin
  # Create a test campaign
  campaign = Campaign.create!(
    name: "EventBridge Test Campaign",
    description: "Testing EventBridge integration end-to-end",
    batch_size: 3,
    call_spacing_seconds: 30,
    status: "draft",
    created_by: "test"
  )
  
  puts "✅ Campaign created: #{campaign.name} (ID: #{campaign.id})"
  
  # Get some test leads
  test_leads = Lead.where.not(phone: [nil, '']).limit(3)
  puts "✅ Found #{test_leads.count} test leads"
  
  if test_leads.any?
    puts "\n🚀 Testing campaign launch..."
    success = campaign.launch_calls!({})
    
    if success
      puts "✅ Campaign launched successfully!"
      puts "   Status: #{campaign.reload.status}"
      puts "   Calls scheduled: #{campaign.campaign_calls.count}"
      
      # Show the calls
      campaign.campaign_calls.each do |call|
        puts "   - #{call.lead.name} (#{call.phone_number}) scheduled for #{call.scheduled_for}"
      end
    else
      puts "❌ Campaign launch failed"
    end
  else
    puts "❌ No test leads available"
  end
  
rescue => e
  puts "❌ Campaign test failed: #{e.message}"
  puts "   Backtrace: #{e.backtrace.first(5).join("\n   ")}"
end

puts "\n🔍 EventBridge events should now be visible in CloudWatch Logs"
puts "   Lambda function: nova-voice-call-processor"
puts "   Log group: /aws/lambda/nova-voice-call-processor"

puts "\n✨ Test complete!"