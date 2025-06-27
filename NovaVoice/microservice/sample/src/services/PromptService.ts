import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

export interface PromptCacheEntry {
  content: string;
  timestamp: number;
}

export class PromptService {
  private s3Client: S3Client;
  private bucketName: string;
  private cache: Map<string, PromptCacheEntry>;
  private cacheTimeout: number;

  constructor(
    bucketName: string = process.env.PROMPTS_S3_BUCKET || 'nova-sonic-prompts',
    cacheTimeout: number = parseInt(process.env.PROMPT_CACHE_TIMEOUT || '300000') // 5 minutes default
  ) {
    this.bucketName = bucketName;
    this.cacheTimeout = cacheTimeout;
    this.cache = new Map();

    // Initialize S3 client with AWS credentials
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: fromNodeProviderChain(),
    });

    console.log(`PromptService initialized with bucket: ${this.bucketName}, cache timeout: ${this.cacheTimeout}ms`);
  }

  /**
   * Get system prompt for the specified assistant
   * @param assistantName - Name of the assistant (e.g., 'esther', 'support-agent')
   * @returns Promise<string> - The system prompt content
   */
  async getSystemPrompt(assistantName: string): Promise<string> {
    const cacheKey = this.getCacheKey(assistantName);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log(`Using cached prompt for assistant: ${assistantName}`);
      return cached.content;
    }

    try {
      console.log(`Loading prompt from S3 for assistant: ${assistantName}`);
      const content = await this.loadFromS3(assistantName);
      
      // Cache successful response
      this.cache.set(cacheKey, {
        content,
        timestamp: Date.now()
      });

      console.log(`Successfully loaded and cached prompt for assistant: ${assistantName} (${content.length} characters)`);
      return content;
    } catch (error) {
      // Clear any stale cache entry on error
      this.cache.delete(cacheKey);
      
      const errorMessage = `Failed to load prompt for assistant '${assistantName}': ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Load prompt content directly from S3
   * @param assistantName - Name of the assistant
   * @returns Promise<string> - The prompt content
   */
  private async loadFromS3(assistantName: string): Promise<string> {
    const key = `assistants/${assistantName}.md`;
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error(`Empty response body for prompt: ${key}`);
      }

      // Convert the response body to string
      const content = await response.Body.transformToString();
      
      if (!content.trim()) {
        throw new Error(`Empty prompt content for assistant: ${assistantName}`);
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        // Check for specific S3 errors
        if (error.name === 'NoSuchKey') {
          throw new Error(`Prompt not found for assistant '${assistantName}' at s3://${this.bucketName}/${key}`);
        }
        if (error.name === 'NoSuchBucket') {
          throw new Error(`S3 bucket '${this.bucketName}' not found`);
        }
        if (error.name === 'AccessDenied') {
          throw new Error(`Access denied to s3://${this.bucketName}/${key}. Check IAM permissions.`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Generate cache key for an assistant
   * @param assistantName - Name of the assistant
   * @returns string - Cache key
   */
  private getCacheKey(assistantName: string): string {
    return `prompt:${assistantName}`;
  }

  /**
   * Check if cached entry is still valid
   * @param timestamp - Timestamp when the entry was cached
   * @returns boolean - True if cache is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return (Date.now() - timestamp) < this.cacheTimeout;
  }

  /**
   * Clear all cached prompts
   */
  clearCache(): void {
    const cacheSize = this.cache.size;
    this.cache.clear();
    console.log(`Cleared ${cacheSize} cached prompts`);
  }

  /**
   * Clear cached prompt for specific assistant
   * @param assistantName - Name of the assistant
   */
  clearCacheForAssistant(assistantName: string): void {
    const cacheKey = this.getCacheKey(assistantName);
    const wasDeleted = this.cache.delete(cacheKey);
    console.log(`${wasDeleted ? 'Cleared' : 'No cache found for'} assistant: ${assistantName}`);
  }

  /**
   * Get cache statistics
   * @returns Object with cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  /**
   * Validate assistant name to prevent path traversal
   * @param assistantName - Name to validate
   * @returns boolean - True if valid
   */
  private isValidAssistantName(assistantName: string): boolean {
    // Only allow alphanumeric characters, hyphens, and underscores
    return /^[a-zA-Z0-9_-]+$/.test(assistantName) && assistantName.length > 0 && assistantName.length <= 50;
  }

  /**
   * Pre-load common assistants at startup
   * @param assistantNames - Array of assistant names to pre-load
   */
  async preloadAssistants(assistantNames: string[]): Promise<void> {
    console.log(`Pre-loading ${assistantNames.length} assistants...`);
    
    const promises = assistantNames.map(async (assistantName) => {
      try {
        await this.getSystemPrompt(assistantName);
        console.log(`✅ Pre-loaded assistant: ${assistantName}`);
      } catch (error) {
        console.error(`❌ Failed to pre-load assistant '${assistantName}': ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    await Promise.allSettled(promises);
    console.log(`Pre-loading complete. Cache size: ${this.cache.size}`);
  }
}

// Export singleton instance
export const promptService = new PromptService();