/**
 * Enhanced Nova Sonic Client with Barge-In Support
 * Extends the base client to add interruption handling
 */

import { NovaSonicBidirectionalStreamClient, StreamSession } from './client';
import { BargeInSessionManager } from './barge-in-handler';
import { Buffer } from 'node:buffer';

export class EnhancedStreamSession extends StreamSession {
  private onInterruptCallback?: () => void;
  private isInterrupted = false;
  
  constructor(
    sessionId: string,
    client: NovaSonicBidirectionalStreamClient,
    private bargeInManager: BargeInSessionManager
  ) {
    super(sessionId, client);
  }
  
  /**
   * Override streamAudio to add interruption detection
   */
  public async streamAudio(audioData: Buffer): Promise<void> {
    console.log(`[BARGE-IN DEBUG] Enhanced streamAudio called for session ${this.getSessionId()}`);
    const handler = this.bargeInManager.getHandler(this.getSessionId());
    
    // Check for interruption
    if (handler.checkForInterruption(audioData)) {
      console.log(`[BARGE-IN] 🚫 INTERRUPTION DETECTED! Handling...`);
      await this.handleInterruption();
    }
    
    // Continue with normal audio streaming
    return super.streamAudio(audioData);
  }
  
  /**
   * Handle interruption event
   */
  private async handleInterruption(): Promise<void> {
    if (this.isInterrupted) return;
    
    this.isInterrupted = true;
    console.log(`🚫 Handling interruption for session ${this.getSessionId()}`);
    
    // Notify callback if set
    if (this.onInterruptCallback) {
      this.onInterruptCallback();
    }
    
    // Send interruption event to Nova Sonic
    await this.sendInterruptionSignal();
    
    // Clear AI output
    (this as any).client.clearAudioOutput(this.getSessionId());
  }
  
  /**
   * Send interruption signal to Nova Sonic
   */
  private async sendInterruptionSignal(): Promise<void> {
    try {
      // Send a special event to interrupt AI generation
      await (this as any).client.sendEvent(this.getSessionId(), {
        event: {
          type: 'systemPrompt',
          content: 'The user has interrupted. Please stop speaking immediately and listen.'
        }
      });
      
      // End current content
      await this.endAudioContent();
      
      // Restart audio for new user input
      await this.setupStartAudio();
      
    } catch (error) {
      console.error('Error sending interruption signal:', error);
    }
  }
  
  /**
   * Set callback for interruption events
   */
  public onInterruption(callback: () => void): void {
    this.onInterruptCallback = callback;
  }
  
  /**
   * Reset interruption state
   */
  public resetInterruption(): void {
    this.isInterrupted = false;
    const handler = this.bargeInManager.getHandler(this.getSessionId());
    handler.reset();
  }
}

export class EnhancedNovaSonicClient extends NovaSonicBidirectionalStreamClient {
  private bargeInManager = new BargeInSessionManager();
  private audioOutputBuffers = new Map<string, Buffer[]>();
  
  constructor(config: any) {
    super(config);
    console.log(`[BARGE-IN] 🚀 EnhancedNovaSonicClient initialized`);
  }
  
  /**
   * Override createStreamSession to return enhanced session
   */
  public createStreamSession(sessionId?: string): EnhancedStreamSession {
    console.log(`[BARGE-IN] 🔧 Creating enhanced stream session...`);
    const baseSession = super.createStreamSession(sessionId);
    const enhancedSession = new EnhancedStreamSession(
      baseSession.getSessionId(),
      this,
      this.bargeInManager
    );
    console.log(`[BARGE-IN] ✅ Enhanced session created: ${enhancedSession.getSessionId()}`);
    
    // Set up event handlers for AI speaking state
    enhancedSession.onEvent('contentStart', () => {
      const handler = this.bargeInManager.getHandler(enhancedSession.getSessionId());
      handler.setAISpeaking(true);
      console.log(`🎤 AI started speaking for session ${enhancedSession.getSessionId()}`);
    });
    
    enhancedSession.onEvent('contentEnd', () => {
      const handler = this.bargeInManager.getHandler(enhancedSession.getSessionId());
      handler.setAISpeaking(false);
      console.log(`🔇 AI stopped speaking for session ${enhancedSession.getSessionId()}`);
    });
    
    // Handle audio output to track what's being sent
    enhancedSession.onEvent('audioOutput', (data: any) => {
      this.bufferAudioOutput(enhancedSession.getSessionId(), data.content);
    });
    
    // Set up interruption callback
    enhancedSession.onInterruption(() => {
      console.log(`🚫 Session ${enhancedSession.getSessionId()} interrupted by user`);
      this.clearAudioOutput(enhancedSession.getSessionId());
    });
    
    return enhancedSession;
  }
  
  /**
   * Buffer audio output for potential clearing
   */
  private bufferAudioOutput(sessionId: string, audioContent: string): void {
    if (!this.audioOutputBuffers.has(sessionId)) {
      this.audioOutputBuffers.set(sessionId, []);
    }
    
    const buffer = Buffer.from(audioContent, 'base64');
    const buffers = this.audioOutputBuffers.get(sessionId)!;
    buffers.push(buffer);
    
    // Keep only last 10 chunks
    if (buffers.length > 10) {
      buffers.shift();
    }
  }
  
  /**
   * Clear audio output buffer when interrupted
   */
  public clearAudioOutput(sessionId: string): void {
    this.audioOutputBuffers.delete(sessionId);
    
    // Dispatch clear event to frontend
    this.dispatchEventToClients(sessionId, 'clearAudio', {
      reason: 'interruption'
    });
  }
  
  /**
   * Send custom event to session
   */
  public async sendEvent(sessionId: string, event: any): Promise<void> {
    const session = (this as any).activeSessions.get(sessionId);
    if (!session) return;
    
    session.queue.push(event);
  }
  
  /**
   * Clean up session
   */
  public async closeSession(sessionId: string): Promise<void> {
    this.bargeInManager.removeHandler(sessionId);
    this.audioOutputBuffers.delete(sessionId);
    return super.closeSession(sessionId);
  }
  
  /**
   * Dispatch event helper
   */
  private dispatchEventToClients(sessionId: string, eventType: string, data: any): void {
    // Use internal method to dispatch events
    (this as any).dispatchEventForSession?.(sessionId, eventType, data);
  }
}