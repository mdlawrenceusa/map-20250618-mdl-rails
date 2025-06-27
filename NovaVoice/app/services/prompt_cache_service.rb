class PromptCacheService
  CACHE_PREFIX = 'prompt:'
  CACHE_EXPIRY = 0.seconds

  class << self
    def fetch_prompt(type:, lead_id: nil, campaign_id: nil)
      cache_key = build_cache_key(type, lead_id, campaign_id)
      
      Rails.cache.fetch(cache_key, expires_in: CACHE_EXPIRY) do
        prompt = Prompt.current_prompt(
          type: type,
          lead_id: lead_id,
          campaign_id: campaign_id
        )
        
        prompt ? prompt_to_hash(prompt) : nil
      end
    end

    def clear_prompt_cache(type:, lead_id: nil, campaign_id: nil)
      cache_key = build_cache_key(type, lead_id, campaign_id)
      Rails.cache.delete(cache_key)
    end

    def clear_all_prompt_caches
      # Clear all prompt-related caches
      Rails.cache.delete_matched("#{CACHE_PREFIX}*")
    end

    def warm_cache
      # Pre-load commonly used prompts into cache
      Prompt::PROMPT_TYPES.each_value do |type|
        # Cache global prompts
        fetch_prompt(type: type)
        
        # Cache campaign-specific prompts
        Prompt.select(:campaign_id).distinct.pluck(:campaign_id).compact.each do |campaign_id|
          fetch_prompt(type: type, campaign_id: campaign_id)
        end
      end
    end

    private

    def build_cache_key(type, lead_id, campaign_id)
      key_parts = [CACHE_PREFIX, type]
      key_parts << "campaign:#{campaign_id}" if campaign_id.present?
      key_parts << "lead:#{lead_id}" if lead_id.present?
      key_parts.join(':')
    end

    def prompt_to_hash(prompt)
      {
        id: prompt.id,
        name: prompt.name,
        content: prompt.content,
        prompt_type: prompt.prompt_type,
        version: prompt.version,
        metadata: prompt.metadata || {},
        created_at: prompt.created_at,
        updated_at: prompt.updated_at
      }
    end
  end
end