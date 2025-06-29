#!/usr/bin/env ruby

# Check current phone number formats in the database
require_relative 'config/environment'

puts "=== PHONE NUMBER FORMAT ANALYSIS ==="
puts

# Sample phone numbers from leads
puts "Sample phone numbers from leads:"
Lead.limit(20).pluck(:phone).compact.each_with_index do |phone, i|
  puts "#{i+1}. #{phone.inspect}"
end

puts
puts "=== PHONE NUMBER STATISTICS ==="
puts "Total leads: #{Lead.count}"
puts "Leads with phone numbers: #{Lead.where.not(phone: [nil, '']).count}"
puts "Leads without phone numbers: #{Lead.where(phone: [nil, '']).count}"

puts
puts "=== UNIQUE PHONE FORMATS ==="
phone_formats = Lead.pluck(:phone).compact.map do |phone|
  # Analyze format patterns
  case phone
  when /^\+1 \(\d{3}\) \d{3}-\d{4}$/
    "E164_FORMATTED (+1 (XXX) XXX-XXXX)"
  when /^\(\d{3}\) \d{3}-\d{4}$/
    "FORMATTED ((XXX) XXX-XXXX)"
  when /^\d{3}-\d{3}-\d{4}$/
    "DASHED (XXX-XXX-XXXX)"
  when /^\d{10}$/
    "DIGITS_ONLY (XXXXXXXXXX)"
  when /^\+1\d{10}$/
    "E164_RAW (+1XXXXXXXXXX)"
  else
    "OTHER (#{phone})"
  end
end

phone_formats.tally.sort_by { |k, v| -v }.each do |format, count|
  puts "#{format}: #{count} records"
end