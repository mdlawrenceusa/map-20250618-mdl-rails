#!/usr/bin/env ruby

require_relative 'config/environment'

puts "📊 Campaign Status Check"
puts "======================="

campaign = Campaign.find(1)
puts "Campaign: #{campaign.name}"
puts "Status: #{campaign.status}"
puts "Calls: #{campaign.campaign_calls.count}"

puts "\nCall Details:"
campaign.campaign_calls.each do |call|
  puts "  - #{call.lead.name} (#{call.phone_number})"
  puts "    Status: #{call.status}"
  puts "    Call UUID: #{call.call_uuid}"
  puts "    Scheduled: #{call.scheduled_for}"
  puts "    Called: #{call.called_at || 'Not called yet'}"
  puts ""
end

puts "✨ Campaign check complete!"