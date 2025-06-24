# Master Seeds File - Choose what to seed
# 
# Usage:
#   rails db:seed                    # Runs default seeds.rb (loads 391 leads)
#   rails runner db/seeds_master.rb  # Runs this file (interactive)
#   SEED_PROMPTS=1 rails runner db/seeds_master.rb  # Seeds only prompts
#   SEED_LEADS=1 rails runner db/seeds_master.rb    # Seeds only leads
#   SEED_ALL=1 rails runner db/seeds_master.rb      # Seeds everything

puts "=" * 60
puts "NovaVoice Database Seeding"
puts "=" * 60

if ENV['SEED_ALL']
  puts "\n🌱 Seeding ALL data...\n"
  load Rails.root.join('db/seeds.rb')
  load Rails.root.join('db/seeds_prompts.rb')
elsif ENV['SEED_PROMPTS']
  puts "\n🎯 Seeding PROMPTS only...\n"
  load Rails.root.join('db/seeds_prompts.rb')
elsif ENV['SEED_LEADS']
  puts "\n📞 Seeding LEADS only...\n"
  load Rails.root.join('db/seeds.rb')
else
  # Interactive mode
  puts "\nWhat would you like to seed?"
  puts "1. Prompts only"
  puts "2. Leads only (391 church records)"
  puts "3. Everything (Prompts + Leads)"
  puts "4. Exit"
  
  print "\nEnter your choice (1-4): "
  choice = gets.chomp
  
  case choice
  when '1'
    puts "\n🎯 Seeding PROMPTS...\n"
    load Rails.root.join('db/seeds_prompts.rb')
  when '2'
    puts "\n📞 Seeding LEADS...\n"
    load Rails.root.join('db/seeds.rb')
  when '3'
    puts "\n🌱 Seeding EVERYTHING...\n"
    load Rails.root.join('db/seeds.rb')
    load Rails.root.join('db/seeds_prompts.rb')
  else
    puts "\n👋 Exiting without seeding anything."
  end
end

puts "\n" + "=" * 60
puts "Seeding complete!"
puts "=" * 60