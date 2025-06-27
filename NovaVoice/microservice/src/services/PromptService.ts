import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../logger';

interface PromptCache {
  content: string;
  cachedAt: number;
}

export class PromptService {
  private s3Client: S3Client;
  private cache = new Map<string, PromptCache>();
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  private readonly BUCKET_NAME = 'nova-sonic-prompts';
  private readonly DEFAULT_PROMPT = `You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
    Key Facts: Program is two-phase outreach (entertainment THEN Gospel presentation), 
    Format is 40-50 min Off-Broadway illusion show + 30 min separate Gospel message, 
    Track Record similar to Campus Crusade approach (~100,000 decisions).
    When asked who attends: The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you.
    Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.
    Website: globaloutreachevent.com, Mike Lawrence Direct Number: 347-300-5533
    
    IMPORTANT: Respond with both speech audio and text. Provide clear, natural speech responses.`;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1'
    });
  }

  /**
   * Get a prompt for a specific assistant, with caching
   * @param assistantName The name of the assistant (e.g., 'esther', 'default')
   * @returns The prompt content string
   */
  async getPrompt(assistantName: string): Promise<string> {
    try {
      // Check cache first
      const cached = this.cache.get(assistantName);
      if (cached && Date.now() - cached.cachedAt < this.CACHE_DURATION_MS) {
        logger.debug('Returning cached prompt', { assistantName });
        return cached.content;
      }

      // Fetch from S3
      const key = `assistants/${assistantName}.md`;
      const command = new GetObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: key
      });

      logger.info('Fetching prompt from S3', { 
        bucket: this.BUCKET_NAME, 
        key,
        assistantName 
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }

      // Convert the stream to string
      const content = await response.Body.transformToString();

      // Update cache
      this.cache.set(assistantName, {
        content,
        cachedAt: Date.now()
      });

      logger.info('Successfully fetched and cached prompt', { 
        assistantName,
        contentLength: content.length 
      });

      return content;

    } catch (error: any) {
      logger.error('Failed to fetch prompt from S3', {
        assistantName,
        error: error.message,
        errorCode: error.Code || error.name,
        stack: error.stack
      });

      // Fall back to default prompt if fetch fails
      if (assistantName === 'default' || assistantName === 'esther') {
        logger.warn('Using hardcoded default prompt as fallback', { assistantName });
        return this.DEFAULT_PROMPT;
      }

      // For non-default assistants, try to get the default from S3
      if (assistantName !== 'default') {
        logger.info('Attempting to fetch default prompt as fallback');
        return this.getPrompt('default');
      }

      // Last resort - return hardcoded default
      return this.DEFAULT_PROMPT;
    }
  }

  /**
   * Clear the cache for a specific assistant or all assistants
   * @param assistantName Optional - if not provided, clears all cached prompts
   */
  clearCache(assistantName?: string): void {
    if (assistantName) {
      this.cache.delete(assistantName);
      logger.info('Cleared cache for assistant', { assistantName });
    } else {
      this.cache.clear();
      logger.info('Cleared all cached prompts');
    }
  }

  /**
   * Preload prompts for specified assistants
   * @param assistantNames Array of assistant names to preload
   */
  async preloadPrompts(assistantNames: string[]): Promise<void> {
    logger.info('Preloading prompts', { assistantNames });

    const promises = assistantNames.map(name => 
      this.getPrompt(name).catch(error => {
        logger.error('Failed to preload prompt', { 
          assistantName: name, 
          error: error.message 
        });
      })
    );

    await Promise.all(promises);
    logger.info('Finished preloading prompts');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { 
    size: number; 
    entries: Array<{ name: string; cachedAt: Date; expiresIn: number }> 
  } {
    const entries = Array.from(this.cache.entries()).map(([name, cache]) => ({
      name,
      cachedAt: new Date(cache.cachedAt),
      expiresIn: Math.max(0, this.CACHE_DURATION_MS - (Date.now() - cache.cachedAt))
    }));

    return {
      size: this.cache.size,
      entries
    };
  }
}