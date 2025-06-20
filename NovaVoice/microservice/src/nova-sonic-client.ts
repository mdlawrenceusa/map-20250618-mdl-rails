/**
 * Nova Sonic Bidirectional Streaming Client
 * Based on the working PoC implementation
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { EventEmitter } from 'events';
import { logger } from './logger';

interface SessionData {
  sessionId: string;
  stream?: any;
  isActive: boolean;
  startTime: number;
  transcript: string[];
}

export class NovaSonicBidirectionalStreamClient extends EventEmitter {
  private client: BedrockRuntimeClient;
  private sessions = new Map<string, SessionData>();
  private modelId = 'amazon.nova-sonic-v1:0';

  constructor() {
    super();
    
    // Initialize with HTTP/2 handler for bidirectional streaming
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttp2Handler({
        maxConcurrentStreams: 10,
      }),
    });

    logger.info('Nova Sonic Bidirectional Client initialized', {
      region: process.env.AWS_REGION || 'us-east-1',
      modelId: this.modelId
    });
  }

  async startSession(sessionId: string, systemPrompt: string): Promise<void> {
    try {
      logger.info('Starting Nova Sonic bidirectional stream', { sessionId });

      // Create session data
      const sessionData: SessionData = {
        sessionId,
        isActive: true,
        startTime: Date.now(),
        transcript: []
      };

      // Prepare the bidirectional stream input
      const input = {
        modelId: this.modelId,
        inputEventStream: this.createInputStream(sessionId, systemPrompt),
      };

      // Start the bidirectional stream
      const command = new InvokeModelWithBidirectionalStreamCommand(input);
      const response = await this.client.send(command);

      if (response.outputStream) {
        sessionData.stream = response.outputStream;
        this.sessions.set(sessionId, sessionData);
        
        // Process the output stream
        this.processOutputStream(sessionId, response.outputStream);
        
        this.emit('sessionStarted', sessionId);
        logger.info('Nova Sonic bidirectional stream started', { sessionId });
      } else {
        throw new Error('Failed to start bidirectional stream');
      }

    } catch (error: any) {
      logger.error('Failed to start Nova Sonic session', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  private async *createInputStream(sessionId: string, systemPrompt: string) {
    logger.debug('Creating input stream for Nova Sonic', { sessionId });

    // Send system prompt first
    yield {
      systemPromptEvent: {
        textConfiguration: {
          text: systemPrompt
        }
      }
    };

    // Send audio configuration
    yield {
      startAudioEvent: {
        audioConfiguration: {
          format: "pcm",
          sampleRateHertz: 16000
        }
      }
    };

    // The stream will be fed audio chunks via sendAudio method
  }

  private async processOutputStream(sessionId: string, outputStream: any): Promise<void> {
    try {
      for await (const event of outputStream) {
        if (event.audioOutputEvent) {
          const audioData = Buffer.from(event.audioOutputEvent.audioChunk, 'base64');
          this.emit('audioOutput', sessionId, audioData);
          
          logger.debug('Received audio from Nova Sonic', {
            sessionId,
            audioSize: audioData.length
          });
        }

        if (event.textOutputEvent) {
          const text = event.textOutputEvent.text;
          const session = this.sessions.get(sessionId);
          if (session) {
            session.transcript.push(text);
          }
          
          this.emit('textOutput', sessionId, text);
          logger.info('Received text from Nova Sonic', { sessionId, text });
        }

        if (event.contentEndEvent) {
          logger.info('Nova Sonic content end event', { sessionId });
          this.emit('contentEnd', sessionId);
        }

        if (event.toolsOutputEvent) {
          logger.debug('Nova Sonic tools output', { sessionId });
          this.emit('toolsOutput', sessionId, event.toolsOutputEvent);
        }
      }
    } catch (error: any) {
      logger.error('Error processing Nova Sonic output stream', {
        sessionId,
        error: error.message
      });
      this.emit('error', sessionId, error);
    }
  }

  async sendAudio(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.warn('Attempted to send audio to inactive session', { sessionId });
      return;
    }

    try {
      // Convert audio to base64 and send as audio event
      const audioBase64 = audioData.toString('base64');
      
      // Create audio input event
      const audioEvent = {
        audioInputEvent: {
          audioChunk: audioBase64
        }
      };

      // Send to the input stream
      // Note: In the real implementation, this would be sent through the input stream generator
      // For now, we'll emit it as an event that the stream can consume
      this.emit('audioInput', sessionId, audioEvent);
      
      logger.debug('Sent audio to Nova Sonic', {
        sessionId,
        audioSize: audioData.length
      });

    } catch (error: any) {
      logger.error('Failed to send audio to Nova Sonic', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      session.isActive = false;
      
      // Send end event
      const endEvent = {
        endStreamEvent: {}
      };
      
      this.emit('sessionEnd', sessionId, endEvent);
      
      // Clean up
      this.sessions.delete(sessionId);
      
      logger.info('Nova Sonic session ended', { 
        sessionId,
        duration: Date.now() - session.startTime,
        transcriptLength: session.transcript.length
      });

    } catch (error: any) {
      logger.error('Error ending Nova Sonic session', {
        sessionId,
        error: error.message
      });
    }
  }

  getSessionTranscript(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    return session ? session.transcript : [];
  }

  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.isActive : false;
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys()).filter(sessionId => 
      this.sessions.get(sessionId)?.isActive
    );
  }
}