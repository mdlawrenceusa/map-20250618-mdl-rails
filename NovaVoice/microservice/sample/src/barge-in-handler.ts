/**
 * Enhanced Barge-In Handler for Nova Sonic
 * Implements voice activity detection and interruption handling
 * Based on patterns from nova_s2s_backend.py for async queue processing
 */

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  sequence: number;
  audioLevel?: number;
}

export interface ConversationState {
  mode: 'listening' | 'speaking' | 'interrupted' | 'processing';
  lastSpeechDetected: number;
  lastAIResponse: number;
  speculativeContent: string;
  interruptionCount: number;
}

export interface BargeInConfig {
  vadThreshold: number;         // Voice activity detection threshold (0-1)
  silenceThreshold: number;     // Silence detection threshold in ms
  interruptionDelay: number;    // Delay before considering it an interruption (ms)
  maxQueueSize: number;         // Maximum audio queue size
  enableSpeculative: boolean;   // Enable speculative generation
  batchProcessingMs: number;    // Audio batch processing interval
}

export class BargeInHandler {
  private audioQueue: AudioChunk[] = [];
  private conversationState: ConversationState;
  private audioEnergyBuffer: number[] = [];
  private bufferSize = 10;  // Number of audio chunks to analyze
  private isProcessingQueue = false;
  private voiceActivityTimer: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private config: BargeInConfig;
  
  constructor(config: Partial<BargeInConfig> = {}) {
    this.config = {
      vadThreshold: 0.01,
      silenceThreshold: 200,
      interruptionDelay: 100,
      maxQueueSize: 50,
      enableSpeculative: true,
      batchProcessingMs: 100,
      ...config
    };
    this.conversationState = {
      mode: 'listening',
      lastSpeechDetected: 0,
      lastAIResponse: 0,
      speculativeContent: '',
      interruptionCount: 0
    };
    
    this.startAsyncQueueProcessor();
  }

  /**
   * Add audio chunk to async processing queue (non-blocking)
   * Similar to nova_s2s_backend.py audio_input_queue.put_nowait()
   */
  public addAudioChunk(audioData: Buffer): void {
    const timestamp = Date.now();
    const audioLevel = this.calculateAudioEnergy(audioData);
    
    const chunk: AudioChunk = {
      data: audioData,
      timestamp,
      sequence: this.audioQueue.length,
      audioLevel
    };

    // Manage queue size (similar to queue overflow handling)
    this.audioQueue.push(chunk);
    if (this.audioQueue.length > this.config.maxQueueSize) {
      this.audioQueue.shift(); // Remove oldest chunk
    }

    // Immediate real-time barge-in detection
    this.detectBargeInRealTime(chunk);
  }

  /**
   * Calculate audio energy/volume from PCM buffer
   */
  private calculateAudioEnergy(audioBuffer: Buffer): number {
    const samples = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 2
    );
    
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += Math.abs(samples[i]);
    }
    
    return sum / samples.length / 32768.0; // Normalize to 0-1
  }

  /**
   * Real-time barge-in detection (immediate response like nova_s2s_backend.py)
   */
  private detectBargeInRealTime(chunk: AudioChunk): void {
    const now = chunk.timestamp;
    const audioLevel = chunk.audioLevel || 0;

    // Speech detection
    if (audioLevel > this.config.vadThreshold) {
      this.conversationState.lastSpeechDetected = now;
      
      // Check for interruption during AI speech
      if (this.conversationState.mode === 'speaking') {
        const timeSinceAIResponse = now - this.conversationState.lastAIResponse;
        
        if (timeSinceAIResponse > this.config.interruptionDelay) {
          console.log(`[BARGE-IN] User interruption detected at ${now}`);
          this.handleInterruption();
        }
      }
      
      this.resetVoiceActivityTimer();
    } else {
      this.startVoiceActivityTimer();
    }
  }

  /**
   * Handle user interruption (similar to nova_s2s_backend.py interruption logic)
   */
  private handleInterruption(): void {
    this.conversationState.mode = 'interrupted';
    this.conversationState.interruptionCount++;
    
    // Clear speculative content (like nova_s2s_backend.py)
    this.conversationState.speculativeContent = '';
    
    // Emit interruption event
    this.emit('bargeInDetected', {
      timestamp: Date.now(),
      interruptionCount: this.conversationState.interruptionCount,
      context: 'user_speech_detected'
    });

    // Quick transition to listening mode
    setTimeout(() => {
      if (this.conversationState.mode === 'interrupted') {
        this.conversationState.mode = 'listening';
        console.log('[BARGE-IN] Transitioned to listening mode');
      }
    }, 200);
  }

  /**
   * Start async queue processor (similar to nova_s2s_backend.py background task)
   */
  private startAsyncQueueProcessor(): void {
    setInterval(() => {
      this.processAudioQueueAsync();
    }, this.config.batchProcessingMs);
  }

  /**
   * Async audio queue processing (inspired by nova_s2s_backend.py)
   */
  private async processAudioQueueAsync(): Promise<void> {
    if (this.isProcessingQueue || this.audioQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.conversationState.mode = 'processing';

    try {
      // Process audio chunks in batches
      const batchSize = Math.min(5, this.audioQueue.length);
      const batch = this.audioQueue.splice(0, batchSize);

      if (batch.length > 0) {
        await this.processBatch(batch);
      }

    } catch (error) {
      console.error('[BARGE-IN] Queue processing error:', error);
    } finally {
      this.isProcessingQueue = false;
      
      // Return to appropriate conversation mode
      if (this.conversationState.mode === 'processing') {
        const timeSinceLastSpeech = Date.now() - this.conversationState.lastSpeechDetected;
        this.conversationState.mode = timeSinceLastSpeech > this.config.silenceThreshold ? 'listening' : 'speaking';
      }
    }
  }

  /**
   * Process batch of audio chunks
   */
  private async processBatch(chunks: AudioChunk[]): Promise<void> {
    // Emit batch ready event for external processing
    this.emit('audioBatchReady', {
      chunks,
      combinedAudio: Buffer.concat(chunks.map(c => c.data)),
      averageLevel: this.calculateBatchAudioLevel(chunks),
      timestamp: Date.now()
    });
  }

  /**
   * Calculate average audio level for a batch
   */
  private calculateBatchAudioLevel(chunks: AudioChunk[]): number {
    if (chunks.length === 0) return 0;
    
    const totalLevel = chunks.reduce((sum, chunk) => sum + (chunk.audioLevel || 0), 0);
    return totalLevel / chunks.length;
  }

  /**
   * Voice activity timer management
   */
  private startVoiceActivityTimer(): void {
    if (this.voiceActivityTimer) {
      clearTimeout(this.voiceActivityTimer);
    }

    this.voiceActivityTimer = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastSpeech = now - this.conversationState.lastSpeechDetected;
      
      if (timeSinceLastSpeech > this.config.silenceThreshold) {
        this.emit('silenceDetected', {
          timestamp: now,
          silenceDuration: timeSinceLastSpeech
        });
      }
    }, this.config.silenceThreshold);
  }

  private resetVoiceActivityTimer(): void {
    if (this.voiceActivityTimer) {
      clearTimeout(this.voiceActivityTimer);
      this.voiceActivityTimer = null;
    }
  }

  /**
   * Event emitter functionality
   */
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[BARGE-IN] Event handler error for ${event}:`, error);
      }
    });
  }

  /**
   * Enhanced voice activity detection (backward compatible)
   */
  public detectVoiceActivity(audioBuffer: Buffer): boolean {
    // Add to async queue for processing
    this.addAudioChunk(audioBuffer);
    
    const energy = this.calculateAudioEnergy(audioBuffer);
    
    // Add to rolling buffer for immediate feedback
    this.audioEnergyBuffer.push(energy);
    if (this.audioEnergyBuffer.length > this.bufferSize) {
      this.audioEnergyBuffer.shift();
    }
    
    // Calculate average energy
    const avgEnergy = this.audioEnergyBuffer.reduce((a, b) => a + b, 0) / this.audioEnergyBuffer.length;
    
    // Voice activity detected if above threshold
    const hasVoiceActivity = avgEnergy > this.config.vadThreshold;
    
    if (hasVoiceActivity) {
      this.conversationState.lastSpeechDetected = Date.now();
    }
    
    return hasVoiceActivity;
  }

  /**
   * Enhanced interruption check (backward compatible)
   */
  public checkForInterruption(audioBuffer: Buffer): boolean {
    if (this.conversationState.mode !== 'speaking') {
      return false;
    }
    
    const hasVoiceActivity = this.detectVoiceActivity(audioBuffer);
    
    if (hasVoiceActivity) {
      const timeSinceLastActivity = Date.now() - this.conversationState.lastSpeechDetected;
      
      // If user has been speaking for more than interruption delay, it's an interruption
      if (timeSinceLastActivity < this.config.interruptionDelay * 2) {
        console.log('🚫 BARGE-IN DETECTED - User interrupting AI');
        this.handleInterruption();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Set AI speaking state (enhanced with speculative content)
   */
  public setAISpeaking(speaking: boolean, speculativeContent: string = ''): void {
    if (speaking) {
      this.conversationState.mode = 'speaking';
      this.conversationState.lastAIResponse = Date.now();
      this.conversationState.speculativeContent = speculativeContent;
    } else {
      this.conversationState.mode = 'listening';
      this.audioEnergyBuffer = [];
    }
    
    console.log(`[CONVERSATION] AI speaking: ${speaking}, mode: ${this.conversationState.mode}`);
  }

  /**
   * Get current AI speaking state (backward compatible)
   */
  public getAISpeaking(): boolean {
    return this.conversationState.mode === 'speaking';
  }

  /**
   * Get enhanced conversation state
   */
  public getConversationState(): ConversationState {
    return { ...this.conversationState };
  }

  /**
   * Set listening mode
   */
  public setListening(): void {
    this.conversationState.mode = 'listening';
    console.log('[CONVERSATION] Listening mode activated');
  }

  /**
   * Get processing stats
   */
  public getStats(): any {
    return {
      queueSize: this.audioQueue.length,
      conversationMode: this.conversationState.mode,
      interruptionCount: this.conversationState.interruptionCount,
      lastSpeechDetected: this.conversationState.lastSpeechDetected,
      isProcessing: this.isProcessingQueue,
      config: this.config
    };
  }

  /**
   * Enhanced reset with full state cleanup
   */
  public reset(): void {
    this.conversationState = {
      mode: 'listening',
      lastSpeechDetected: 0,
      lastAIResponse: 0,
      speculativeContent: '',
      interruptionCount: 0
    };
    
    this.audioQueue = [];
    this.audioEnergyBuffer = [];
    this.isProcessingQueue = false;
    
    if (this.voiceActivityTimer) {
      clearTimeout(this.voiceActivityTimer);
      this.voiceActivityTimer = null;
    }
    
    console.log('[BARGE-IN] Handler reset completed');
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.reset();
    this.eventHandlers.clear();
    console.log('[BARGE-IN] Handler cleaned up');
  }
}

/**
 * Enhanced session-aware barge-in manager with async queue processing
 */
export class BargeInSessionManager {
  private sessions = new Map<string, BargeInHandler>();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor() {
    // Cleanup inactive sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 300000);
  }
  
  /**
   * Get or create barge-in handler for session with custom config
   */
  public getHandler(sessionId: string, config?: Partial<BargeInConfig>): BargeInHandler {
    if (!this.sessions.has(sessionId)) {
      const handler = new BargeInHandler(config);
      
      // Set up event handlers for centralized logging
      handler.on('bargeInDetected', (data) => {
        console.log(`[SESSION-${sessionId}] Barge-in detected:`, data);
      });
      
      handler.on('silenceDetected', (data) => {
        console.log(`[SESSION-${sessionId}] Silence detected:`, data);
      });
      
      handler.on('audioBatchReady', (data) => {
        console.log(`[SESSION-${sessionId}] Audio batch ready: ${data.chunks.length} chunks, avg level: ${data.averageLevel.toFixed(3)}`);
      });
      
      this.sessions.set(sessionId, handler);
      console.log(`[SESSION-MANAGER] Created new handler for session ${sessionId}`);
    }
    return this.sessions.get(sessionId)!;
  }
  
  /**
   * Remove handler for session with cleanup
   */
  public removeHandler(sessionId: string): void {
    const handler = this.sessions.get(sessionId);
    if (handler) {
      handler.cleanup();
      this.sessions.delete(sessionId);
      console.log(`[SESSION-MANAGER] Removed handler for session ${sessionId}`);
    }
  }
  
  /**
   * Check if session has active handler
   */
  public hasHandler(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
  
  /**
   * Get stats for all active sessions
   */
  public getAllStats(): Map<string, any> {
    const stats = new Map();
    for (const [sessionId, handler] of this.sessions) {
      stats.set(sessionId, handler.getStats());
    }
    return stats;
  }
  
  /**
   * Get total queue sizes across all sessions
   */
  public getTotalQueueSize(): number {
    let total = 0;
    for (const handler of this.sessions.values()) {
      total += handler.getStats().queueSize;
    }
    return total;
  }
  
  /**
   * Cleanup inactive sessions (no recent activity)
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const inactiveThreshold = 300000; // 5 minutes
    
    for (const [sessionId, handler] of this.sessions) {
      const stats = handler.getStats();
      const timeSinceLastSpeech = now - stats.lastSpeechDetected;
      
      if (timeSinceLastSpeech > inactiveThreshold && stats.queueSize === 0) {
        console.log(`[SESSION-MANAGER] Cleaning up inactive session ${sessionId}`);
        this.removeHandler(sessionId);
      }
    }
  }
  
  /**
   * Shutdown all sessions and cleanup
   */
  public shutdown(): void {
    console.log(`[SESSION-MANAGER] Shutting down ${this.sessions.size} sessions`);
    
    for (const [sessionId, handler] of this.sessions) {
      handler.cleanup();
    }
    
    this.sessions.clear();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    console.log('[SESSION-MANAGER] Shutdown complete');
  }
}