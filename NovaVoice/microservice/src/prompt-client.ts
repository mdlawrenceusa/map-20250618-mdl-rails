import axios, { AxiosInstance } from 'axios';
import { logger } from './logger';

export interface Prompt {
  id: number;
  name: string;
  content: string;
  prompt_type: string;
  version: number;
  is_active: boolean;
  lead_id?: number;
  campaign_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PromptVariables {
  [key: string]: string | number;
}

export class PromptClient {
  private client: AxiosInstance;
  private cache: Map<string, { prompt: Prompt | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 0; // No cache - immediate updates

  constructor(baseUrl: string = process.env.RAILS_API_URL || 'http://localhost:8080') {
    this.client = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch the current active prompt by type, with optional lead/campaign filtering
   */
  async getCurrentPrompt(
    type: string,
    leadId?: number,
    campaignId?: string
  ): Promise<Prompt | null> {
    const cacheKey = `${type}:${leadId || 'none'}:${campaignId || 'none'}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug('Returning cached prompt', { type, leadId, campaignId });
      return cached.prompt;
    }

    try {
      const params: any = { type };
      if (leadId) params.lead_id = leadId;
      if (campaignId) params.campaign_id = campaignId;

      const response = await this.client.get('/prompts/current', { params });
      
      const prompt = response.data;
      
      // Cache the result
      this.cache.set(cacheKey, { prompt, timestamp: Date.now() });
      
      logger.info('Fetched prompt from Rails API', {
        type,
        promptId: prompt.id,
        version: prompt.version,
      });

      return prompt;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // No prompt found, cache null result
        this.cache.set(cacheKey, { prompt: null, timestamp: Date.now() });
        logger.warn('No prompt found', { type, leadId, campaignId });
        return null;
      }
      
      logger.error('Error fetching prompt', {
        type,
        leadId,
        campaignId,
        error: error.message,
      });
      
      // Return cached value if available, even if expired
      const cachedFallback = this.cache.get(cacheKey);
      if (cachedFallback) {
        logger.warn('Using expired cached prompt due to API error');
        return cachedFallback.prompt;
      }
      
      throw error;
    }
  }

  /**
   * Render a prompt with variables
   */
  async renderPrompt(
    promptId: number,
    variables: PromptVariables
  ): Promise<string> {
    try {
      const response = await this.client.post('/prompts/render', {
        prompt_id: promptId,
        variables,
      });

      return response.data.rendered_content;
    } catch (error: any) {
      logger.error('Error rendering prompt', {
        promptId,
        variables,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all prompts (for debugging/admin purposes)
   */
  async getAllPrompts(filters: {
    active?: boolean;
    type?: string;
    campaignId?: string;
    leadId?: number;
  } = {}): Promise<Prompt[]> {
    try {
      const params: any = {};
      if (filters.active !== undefined) params.active = filters.active;
      if (filters.type) params.type = filters.type;
      if (filters.campaignId) params.campaign_id = filters.campaignId;
      if (filters.leadId) params.lead_id = filters.leadId;

      const response = await this.client.get('/prompts', { params });
      return response.data.prompts;
    } catch (error: any) {
      logger.error('Error fetching prompts', {
        filters,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Clear the cache (useful when prompts are updated)
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Prompt cache cleared');
  }

  /**
   * Get default prompts for Nova Sonic
   */
  async getDefaultPrompts(leadId?: number, campaignId?: string): Promise<{
    system: string;
    greeting: string;
    scheduling: string;
  }> {
    const [systemPrompt, greetingPrompt, schedulingPrompt] = await Promise.all([
      this.getCurrentPrompt('system', leadId, campaignId),
      this.getCurrentPrompt('greeting', leadId, campaignId),
      this.getCurrentPrompt('scheduling', leadId, campaignId),
    ]);

    // Fallback to hardcoded defaults if prompts not found
    return {
      system: systemPrompt?.content || this.getHardcodedSystemPrompt(),
      greeting: greetingPrompt?.content || this.getHardcodedGreetingPrompt(),
      scheduling: schedulingPrompt?.content || this.getHardcodedSchedulingPrompt(),
    };
  }

  private getHardcodedSystemPrompt(): string {
    return `You are Esther, a warm and professional scheduling assistant for Mike Lawrence Productions. 
    Your ONLY purpose is to schedule 15-minute web meetings between senior pastors and Mike Lawrence 
    to discuss spreading the Gospel through modern outreach programs.

    Keep responses brief (under 25 words), be warm and professional, and always redirect to scheduling.`;
  }

  private getHardcodedGreetingPrompt(): string {
    return `Hello, this is Esther from Mike Lawrence Productions. 
    I'm calling to schedule a brief 15-minute meeting with the senior pastor 
    about our Gospel outreach program. Is this a good time?`;
  }

  private getHardcodedSchedulingPrompt(): string {
    return `Wonderful! I have the following time slots available for a 15-minute web meeting. 
    Which time works best for the pastor?`;
  }
}

// Export a singleton instance
export const promptClient = new PromptClient();