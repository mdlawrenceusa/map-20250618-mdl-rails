namespace :prompts do
  desc "Seed default prompts for NovaVoice"
  task seed: :environment do
    puts "Loading prompt seed file..."
    load Rails.root.join('db', 'seeds', 'prompts.rb')
  end

  desc "List all active prompts"
  task list: :environment do
    prompts = Prompt.active.order(:prompt_type, :name)
    
    if prompts.empty?
      puts "No active prompts found."
    else
      puts "\nActive Prompts:"
      puts "-" * 80
      
      prompts.group_by(&:prompt_type).each do |type, type_prompts|
        puts "\n#{type.upcase} PROMPTS:"
        type_prompts.each do |prompt|
          puts "\n  Name: #{prompt.name} (v#{prompt.version})"
          puts "  Lead ID: #{prompt.lead_id || 'Global'}"
          puts "  Campaign ID: #{prompt.campaign_id || 'Global'}"
          puts "  Content: #{prompt.content.truncate(100)}"
          puts "  Updated: #{prompt.updated_at}"
        end
      end
      puts "-" * 80
    end
  end

  desc "Clear prompt cache"
  task clear_cache: :environment do
    PromptCacheService.clear_all_prompt_caches
    puts "Prompt cache cleared successfully."
  end

  desc "Warm prompt cache"
  task warm_cache: :environment do
    puts "Warming prompt cache..."
    PromptCacheService.warm_cache
    puts "Prompt cache warmed successfully."
  end
end