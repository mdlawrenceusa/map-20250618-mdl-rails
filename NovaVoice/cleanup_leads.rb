#!/usr/bin/env ruby

require_relative 'config/environment'

puts "🧹 Cleaning Up Duplicate Leads"
puts "==============================="

initial_count = Lead.count
puts "Initial lead count: #{initial_count}"

# Find duplicates using a simpler approach for SQLite
puts "🔍 Finding duplicates..."
all_leads = Lead.all.to_a
duplicates_map = {}

all_leads.each do |lead|
  key = [lead.name, lead.phone, lead.email]
  duplicates_map[key] ||= []
  duplicates_map[key] << lead
end

# Filter to only groups with duplicates
duplicate_groups = duplicates_map.select { |key, leads| leads.count > 1 }

puts "Found #{duplicate_groups.count} duplicate groups"

# Keep track of what we're doing
kept_records = 0
deleted_records = 0

puts "\n🔄 Processing duplicates..."

duplicate_groups.each do |key, leads|
  # Sort by created_at to keep the oldest record
  sorted_leads = leads.sort_by(&:created_at)
  
  # Keep the first record (oldest), delete the rest
  lead_to_keep = sorted_leads.first
  leads_to_delete = sorted_leads[1..-1]
  
  if leads_to_delete.any?
    count_to_delete = leads_to_delete.count
    
    # Delete the duplicate records
    leads_to_delete.each(&:destroy)
    
    kept_records += 1
    deleted_records += count_to_delete
    
    if (kept_records % 50) == 0
      puts "  Processed #{kept_records} groups..."
    end
  end
end

final_count = Lead.count

puts "\n✅ Cleanup Complete!"
puts "  Initial records: #{initial_count}"
puts "  Records kept: #{kept_records} (one per unique lead)"
puts "  Records deleted: #{deleted_records}"
puts "  Final count: #{final_count}"
puts "  Expected ~391: #{final_count <= 450 ? '✅ Looks correct!' : '⚠️ Still seems high'}"

# Verify no more exact duplicates using the same approach
verification_leads = Lead.all.to_a
verification_map = {}
verification_leads.each do |lead|
  key = [lead.name, lead.phone, lead.email]
  verification_map[key] ||= []
  verification_map[key] << lead
end
remaining_duplicates = verification_map.select { |key, leads| leads.count > 1 }
puts "  Remaining duplicates: #{remaining_duplicates.count} (should be 0)"

puts "\n📊 Updated Statistics:"
puts "  Total leads: #{Lead.count}"
puts "  Unique names: #{Lead.distinct.count(:name)}"
puts "  Unique phones: #{Lead.distinct.count(:phone)}"
puts "  Callable leads: #{Lead.where.not(phone: [nil, '']).count}"

puts "\n✨ Database cleaned successfully!"