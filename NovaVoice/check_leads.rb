#!/usr/bin/env ruby

require_relative 'config/environment'

puts "📊 Lead Database Analysis"
puts "========================"

total_leads = Lead.count
unique_names = Lead.distinct.count(:name)
unique_phones = Lead.distinct.count(:phone)
unique_emails = Lead.distinct.count(:email)

puts "Total leads: #{total_leads}"
puts "Unique names: #{unique_names}"
puts "Unique phones: #{unique_phones}"
puts "Unique emails: #{unique_emails}"

# Check for exact duplicates
puts "\n🔍 Duplicate Analysis:"
duplicates = Lead.group(:name, :phone, :email).having('count(*) > 1').count
puts "Exact duplicates (same name+phone+email): #{duplicates.count}"

if duplicates.any?
  puts "\nExample duplicate groups:"
  duplicates.first(5).each do |key, count|
    name, phone, email = key
    puts "  '#{name}' (#{phone}) - #{count} records"
  end
  
  total_duplicate_records = duplicates.values.sum
  unique_records = total_leads - total_duplicate_records + duplicates.count
  puts "\nDuplicate Summary:"
  puts "  Total records: #{total_leads}"
  puts "  Duplicate records: #{total_duplicate_records}"
  puts "  Unique records: #{unique_records}"
  puts "  Expected ~391 records, ratio: #{(total_leads.to_f / 391).round(1)}x"
end

# Check for phone number duplicates specifically
phone_duplicates = Lead.group(:phone).having('count(*) > 1').count
puts "\nPhone number duplicates: #{phone_duplicates.count}"

if phone_duplicates.any?
  puts "Example phone duplicates:"
  phone_duplicates.first(3).each do |phone, count|
    puts "  #{phone}: #{count} records"
    Lead.where(phone: phone).each do |lead|
      puts "    - #{lead.name} (#{lead.company})"
    end
  end
end

puts "\n📈 Load History Check:"
# Check creation dates to see if we can identify multiple loads
creation_dates = Lead.group("date(created_at)").count
puts "Leads by creation date:"
creation_dates.each do |date, count|
  puts "  #{date}: #{count} records"
end

puts "\n✨ Analysis complete!"