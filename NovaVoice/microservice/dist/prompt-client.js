"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptClient = exports.PromptClient = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("./logger");
class PromptClient {
    constructor(baseUrl = process.env.RAILS_API_URL || 'http://localhost:8080') {
        this.cache = new Map();
        this.CACHE_TTL = 60000; // 1 minute cache
        this.client = axios_1.default.create({
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
    async getCurrentPrompt(type, leadId, campaignId) {
        var _a;
        const cacheKey = `${type}:${leadId || 'none'}:${campaignId || 'none'}`;
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            logger_1.logger.debug('Returning cached prompt', { type, leadId, campaignId });
            return cached.prompt;
        }
        try {
            const params = { type };
            if (leadId)
                params.lead_id = leadId;
            if (campaignId)
                params.campaign_id = campaignId;
            const response = await this.client.get('/prompts/current', { params });
            const prompt = response.data;
            // Cache the result
            this.cache.set(cacheKey, { prompt, timestamp: Date.now() });
            logger_1.logger.info('Fetched prompt from Rails API', {
                type,
                promptId: prompt.id,
                version: prompt.version,
            });
            return prompt;
        }
        catch (error) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
                // No prompt found, cache null result
                this.cache.set(cacheKey, { prompt: null, timestamp: Date.now() });
                logger_1.logger.warn('No prompt found', { type, leadId, campaignId });
                return null;
            }
            logger_1.logger.error('Error fetching prompt', {
                type,
                leadId,
                campaignId,
                error: error.message,
            });
            // Return cached value if available, even if expired
            const cachedFallback = this.cache.get(cacheKey);
            if (cachedFallback) {
                logger_1.logger.warn('Using expired cached prompt due to API error');
                return cachedFallback.prompt;
            }
            throw error;
        }
    }
    /**
     * Render a prompt with variables
     */
    async renderPrompt(promptId, variables) {
        try {
            const response = await this.client.post('/prompts/render', {
                prompt_id: promptId,
                variables,
            });
            return response.data.rendered_content;
        }
        catch (error) {
            logger_1.logger.error('Error rendering prompt', {
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
    async getAllPrompts(filters = {}) {
        try {
            const params = {};
            if (filters.active !== undefined)
                params.active = filters.active;
            if (filters.type)
                params.type = filters.type;
            if (filters.campaignId)
                params.campaign_id = filters.campaignId;
            if (filters.leadId)
                params.lead_id = filters.leadId;
            const response = await this.client.get('/prompts', { params });
            return response.data.prompts;
        }
        catch (error) {
            logger_1.logger.error('Error fetching prompts', {
                filters,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Clear the cache (useful when prompts are updated)
     */
    clearCache() {
        this.cache.clear();
        logger_1.logger.info('Prompt cache cleared');
    }
    /**
     * Get default prompts for Nova Sonic
     */
    async getDefaultPrompts(leadId, campaignId) {
        const [systemPrompt, greetingPrompt, schedulingPrompt] = await Promise.all([
            this.getCurrentPrompt('system', leadId, campaignId),
            this.getCurrentPrompt('greeting', leadId, campaignId),
            this.getCurrentPrompt('scheduling', leadId, campaignId),
        ]);
        // Fallback to hardcoded defaults if prompts not found
        return {
            system: (systemPrompt === null || systemPrompt === void 0 ? void 0 : systemPrompt.content) || this.getHardcodedSystemPrompt(),
            greeting: (greetingPrompt === null || greetingPrompt === void 0 ? void 0 : greetingPrompt.content) || this.getHardcodedGreetingPrompt(),
            scheduling: (schedulingPrompt === null || schedulingPrompt === void 0 ? void 0 : schedulingPrompt.content) || this.getHardcodedSchedulingPrompt(),
        };
    }
    getHardcodedSystemPrompt() {
        return `You are Esther, a warm and professional scheduling assistant for Mike Lawrence Productions. 
    Your ONLY purpose is to schedule 15-minute web meetings between senior pastors and Mike Lawrence 
    to discuss spreading the Gospel through modern outreach programs.

    Keep responses brief (under 25 words), be warm and professional, and always redirect to scheduling.`;
    }
    getHardcodedGreetingPrompt() {
        return `Hello, this is Esther from Mike Lawrence Productions. 
    I'm calling to schedule a brief 15-minute meeting with the senior pastor 
    about our Gospel outreach program. Is this a good time?`;
    }
    getHardcodedSchedulingPrompt() {
        return `Wonderful! I have the following time slots available for a 15-minute web meeting. 
    Which time works best for the pastor?`;
    }
}
exports.PromptClient = PromptClient;
// Export a singleton instance
exports.promptClient = new PromptClient();
