/**
 * Nova Sonic Bidirectional Streaming Implementation
 * Handles real-time audio streaming with barge-in support
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface AudioFrame {
  timestamp: number;
  data: Buffer;
  energy: number;
}

interface StreamingConfig {
  inputSampleRate: number;
  outputSampleRate: number;
  vadThreshold: number;
  vadDuration: number;
  bargeInEnabled: boolean;
}

export class NovaSonicBidirectionalStream extends EventEmitter {
  private ws: WebSocket | null = null;
  private isStreaming: boolean = false;
  private isAISpeaking: boolean = false;
  private audioBuffer: AudioFrame[] = [];
  private lastSpeechTime: number = 0;
  private config: StreamingConfig;
  private sessionId: string;

  constructor(sessionId: string, config?: Partial<StreamingConfig>) {
    super();
    this.sessionId = sessionId;
    this.config = {
      inputSampleRate: 16000,
      outputSampleRate: 24000,
      vadThreshold: 0.01,
      vadDuration: 200,
      bargeInEnabled: true,
      ...config
    };
  }

  /**
   * Initialize WebSocket connection to Nova Sonic
   */
  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        console.log(`[${this.sessionId}] ✅ Connected to Nova Sonic`);
        this.isStreaming = true;
        resolve();
      });

      this.ws.on('message', (data: any) => {
        this.handleNovaSonicMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        console.error(`[${this.sessionId}] ❌ WebSocket error:`, error);
        this.emit('error', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`[${this.sessionId}] 🔌 Disconnected from Nova Sonic`);
        this.isStreaming = false;
        this.emit('disconnected');
      });
    });
  }

  /**
   * Stream audio to Nova Sonic with VAD and barge-in detection
   */
  async streamAudio(audioData: Buffer): Promise<void> {
    if (!this.isStreaming || !this.ws) {
      throw new Error('Not connected to Nova Sonic');
    }

    // Calculate audio energy for VAD
    const energy = this.calculateAudioEnergy(audioData);
    const timestamp = Date.now();

    // Store frame for analysis
    this.audioBuffer.push({ timestamp, data: audioData, energy });
    
    // Keep only recent frames (last 500ms)
    const cutoff = timestamp - 500;
    this.audioBuffer = this.audioBuffer.filter(f => f.timestamp > cutoff);

    // Check for speech/interruption
    if (this.config.bargeInEnabled && this.isAISpeaking) {
      const isInterruption = this.detectInterruption(energy, timestamp);
      
      if (isInterruption) {
        console.log(`[${this.sessionId}] 🚫 INTERRUPTION DETECTED! Energy: ${energy.toFixed(4)}`);
        await this.handleBargeIn();
        return;
      }
    }

    // Send audio to Nova Sonic
    const message = {
      type: 'audio',
      data: audioData.toString('base64'),
      timestamp,
      sampleRate: this.config.inputSampleRate
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Calculate audio energy for VAD
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
   * Detect if user is interrupting AI speech
   */
  private detectInterruption(energy: number, timestamp: number): boolean {
    if (energy < this.config.vadThreshold) {
      return false;
    }

    // Check if we have sustained speech
    const recentSpeech = this.audioBuffer.filter(
      f => f.timestamp > timestamp - this.config.vadDuration && 
           f.energy > this.config.vadThreshold
    );

    const speechDuration = recentSpeech.length > 0 ? 
      timestamp - recentSpeech[0].timestamp : 0;

    return speechDuration >= this.config.vadDuration;
  }

  /**
   * Handle barge-in event
   */
  private async handleBargeIn(): Promise<void> {
    this.emit('bargeIn', this.sessionId);
    
    // Send interruption signal to Nova Sonic
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = {
        type: 'interrupt',
        timestamp: Date.now(),
        sessionId: this.sessionId
      };
      this.ws.send(JSON.stringify(message));
    }

    // Stop AI speaking
    this.isAISpeaking = false;
  }

  /**
   * Handle messages from Nova Sonic
   */
  private handleNovaSonicMessage(data: any): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'audioStart':
          this.isAISpeaking = true;
          this.emit('aiSpeakingStart');
          break;
          
        case 'audioEnd':
          this.isAISpeaking = false;
          this.emit('aiSpeakingEnd');
          break;
          
        case 'audio':
          // Emit audio data for playback
          const audioBuffer = Buffer.from(message.data, 'base64');
          this.emit('audioOutput', audioBuffer);
          break;
          
        case 'transcript':
          this.emit('transcript', message.text, message.isFinal);
          break;
          
        case 'error':
          this.emit('error', new Error(message.error));
          break;
      }
    } catch (error) {
      console.error(`[${this.sessionId}] Error parsing Nova Sonic message:`, error);
    }
  }

  /**
   * Send control message to Nova Sonic
   */
  async sendControl(command: string, params?: any): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      type: 'control',
      command,
      params,
      timestamp: Date.now()
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Clean disconnect
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.isStreaming = false;
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      sessionId: this.sessionId,
      isStreaming: this.isStreaming,
      isAISpeaking: this.isAISpeaking,
      connected: this.ws?.readyState === WebSocket.OPEN
    };
  }
}

/**
 * Factory for creating bidirectional streams
 */
export class NovaSonicStreamFactory {
  private streams: Map<string, NovaSonicBidirectionalStream> = new Map();
  private defaultConfig: Partial<StreamingConfig>;

  constructor(defaultConfig?: Partial<StreamingConfig>) {
    this.defaultConfig = defaultConfig || {};
  }

  /**
   * Create or get existing stream
   */
  getStream(sessionId: string): NovaSonicBidirectionalStream {
    if (!this.streams.has(sessionId)) {
      const stream = new NovaSonicBidirectionalStream(sessionId, this.defaultConfig);
      this.streams.set(sessionId, stream);
      
      // Auto-cleanup on disconnect
      stream.once('disconnected', () => {
        this.streams.delete(sessionId);
      });
    }
    
    return this.streams.get(sessionId)!;
  }

  /**
   * Remove stream
   */
  removeStream(sessionId: string): void {
    const stream = this.streams.get(sessionId);
    if (stream) {
      stream.disconnect();
      this.streams.delete(sessionId);
    }
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }
}