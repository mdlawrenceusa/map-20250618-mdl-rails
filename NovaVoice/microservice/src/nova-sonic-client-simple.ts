/**
 * Nova Sonic Client with direct TypeScript implementation from PoC
 */

import { EventEmitter } from 'events';
import { logger } from './logger';
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import {
  NodeHttp2Handler,
} from "@smithy/node-http-handler";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import { take } from "rxjs/operators";
import { firstValueFrom } from "rxjs";

// Default configurations
const DefaultTextConfiguration = {
  mediaType: "text/plain",
};

const DefaultAudioInputConfiguration = {
  mediaType: "audio/lpcm",
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
  audioType: "SPEECH",
  encoding: "base64",
};

const DefaultAudioOutputConfiguration = {
  mediaType: "audio/lpcm",
  sampleRateHertz: 24000,
  sampleSizeBits: 16,
  channelCount: 1,
  voiceId: "matthew",
  encoding: "base64",
  audioType: "SPEECH",
};

const DefaultSystemPrompt = `You are Esther, Mike Lawrence Productions' scheduling assistant. 
Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.`;

export interface InferenceConfig {
  maxTokens: number;
  topP: number;
  temperature: number;
}

export interface SessionData {
  queue: any[];
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  responseSubject: Subject<any>;
  responseHandlers: Map<string, (data: any) => void>;
  promptName: string;
  inferenceConfig: InferenceConfig;
  isActive: boolean;
  isPromptStartSent: boolean;
  isAudioContentStartSent: boolean;
  audioContentId: string;
  startTime: number;
  transcript: string[];
  systemPrompt: string;
}

export class NovaSonicClient extends EventEmitter {
  private bedrockRuntimeClient: BedrockRuntimeClient;
  private inferenceConfig: InferenceConfig;
  private activeSessions: Map<string, SessionData> = new Map();
  private sessionLastActivity: Map<string, number> = new Map();
  private sessionCleanupInProgress = new Set<string>();

  constructor() {
    super();
    
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
    });

    this.bedrockRuntimeClient = new BedrockRuntimeClient({
      credentials: fromNodeProviderChain(),
      region: process.env.AWS_REGION || "us-east-1",
      requestHandler: nodeHttp2Handler,
    });

    this.inferenceConfig = {
      maxTokens: 1024,
      topP: 0.9,
      temperature: 0.7,
    };
    
    logger.info('Nova Sonic Client initialized (direct TypeScript implementation)');
  }

  async startSession(sessionId: string, systemPrompt: string): Promise<void> {
    try {
      logger.info('Starting Nova Sonic session', { sessionId });

      if (this.activeSessions.has(sessionId)) {
        throw new Error(`Stream session with ID ${sessionId} already exists`);
      }

      const session: SessionData = {
        queue: [],
        queueSignal: new Subject<void>(),
        closeSignal: new Subject<void>(),
        responseSubject: new Subject<any>(),
        responseHandlers: new Map(),
        promptName: randomUUID(),
        inferenceConfig: this.inferenceConfig,
        isActive: true,
        isPromptStartSent: false,
        isAudioContentStartSent: false,
        audioContentId: randomUUID(),
        startTime: Date.now(),
        transcript: [],
        systemPrompt: systemPrompt
      };

      this.activeSessions.set(sessionId, session);
      this.sessionLastActivity.set(sessionId, Date.now());

      // Set up event handlers
      session.responseHandlers.set('audioOutput', (data: any) => {
        const audioBuffer = Buffer.from(data.content, 'base64');
        this.emit('audioOutput', sessionId, audioBuffer);
        logger.debug('Received audio from Nova Sonic', { 
          sessionId,
          size: audioBuffer.length 
        });
      });

      session.responseHandlers.set('textOutput', (data: any) => {
        session.transcript.push(data.content);
        this.emit('textOutput', sessionId, data.content);
        logger.info('Received text from Nova Sonic', { 
          sessionId,
          text: data.content 
        });
      });

      session.responseHandlers.set('error', (data: any) => {
        logger.error('Nova Sonic processing error', { 
          sessionId,
          error: data
        });
        this.emit('error', sessionId, new Error(JSON.stringify(data)));
      });

      // Initialize the session and start the bidirectional stream
      await this.initiateSession(sessionId);
      
      // Now set up the events in proper sequence with awaits
      await this.setupPromptStart(sessionId);
      await this.setupSystemPrompt(sessionId, systemPrompt);  
      await this.setupStartAudio(sessionId);
      
      this.emit('sessionStarted', sessionId);
      logger.info('Nova Sonic session started', { sessionId });

    } catch (error: any) {
      logger.error('Failed to start Nova Sonic session', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async sendAudio(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.warn('Attempted to send audio to inactive session', { sessionId });
      return;
    }

    // Check if audio content has been started
    if (!session.isAudioContentStartSent) {
      logger.debug('Audio content not started yet, buffering audio', { sessionId });
      return;
    }

    try {
      logger.debug('Sending audio to Nova Sonic', {
        sessionId,
        audioSize: audioData.length
      });

      // Stream audio directly to Nova Sonic
      await this.streamAudioChunk(sessionId, audioData);
      this.updateSessionActivity(sessionId);

    } catch (error: any) {
      logger.error('Failed to send audio to Nova Sonic', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      this.emit('error', sessionId, error);
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      logger.info('Nova Sonic session ended', { 
        sessionId,
        duration: Date.now() - session.startTime,
        transcriptLength: session.transcript.length
      });

      await this.closeSession(sessionId);
      this.emit('sessionEnded', sessionId);

    } catch (error: any) {
      logger.error('Error ending Nova Sonic session', {
        sessionId,
        error: error.message
      });
    }
  }

  getSessionTranscript(sessionId: string): string[] {
    const session = this.activeSessions.get(sessionId);
    return session ? session.transcript : [];
  }

  isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return session ? session.isActive : false;
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys()).filter(sessionId => 
      this.activeSessions.get(sessionId)?.isActive
    );
  }

  // Core Nova Sonic implementation methods from PoC
  private updateSessionActivity(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  async setupPromptStart(sessionId: string): Promise<void> {
    logger.info('Setting up prompt start', { sessionId });
    return new Promise((resolve) => {
      this.setupPromptStartEvent(sessionId);
      setTimeout(resolve, 100); // Allow time for event processing
    });
  }

  async setupSystemPrompt(sessionId: string, systemPrompt: string): Promise<void> {
    logger.info('Setting up system prompt', { sessionId });
    return new Promise((resolve) => {
      this.setupSystemPromptEvent(sessionId, DefaultTextConfiguration, systemPrompt);
      setTimeout(resolve, 100); // Allow time for event processing
    });
  }

  async setupStartAudio(sessionId: string): Promise<void> {
    logger.info('Setting up start audio', { sessionId });
    return new Promise((resolve) => {
      this.setupStartAudioEvent(sessionId);
      setTimeout(resolve, 100); // Allow time for event processing
    });
  }

  private async initiateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Stream session ${sessionId} not found`);
    }

    try {
      this.setupSessionStartEvent(sessionId);
      const asyncIterable = this.createSessionAsyncIterable(sessionId);

      logger.info(`Starting bidirectional stream for session ${sessionId}...`);

      const response = await this.bedrockRuntimeClient.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: "amazon.nova-sonic-v1:0",
          body: asyncIterable,
        })
      );

      logger.info(`Stream established for session ${sessionId}, processing responses...`);

      // Process response stream in background
      this.processResponseStream(sessionId, response).catch(error => {
        logger.error(`Error in response stream for session ${sessionId}:`, error);
        this.emit('error', sessionId, error);
      });

      // Give the stream a moment to stabilize before returning
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      logger.error(`Error in session ${sessionId}: `, error);
      this.emit('error', sessionId, error);
      if (session.isActive) this.closeSession(sessionId);
    }
  }

  private createSessionAsyncIterable(sessionId: string): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Cannot create async iterable: Session ${sessionId} not found`);
    }

    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
          try {
            if (!session.isActive || !this.activeSessions.has(sessionId)) {
              logger.debug(`Session ${sessionId} not active, ending iterator`);
              return { value: undefined, done: true };
            }

            // Wait for events to be available or session to close
            while (session.queue.length === 0 && session.isActive) {
              try {
                await Promise.race([
                  firstValueFrom(session.queueSignal.pipe(take(1))),
                  firstValueFrom(session.closeSignal.pipe(take(1))).then(() => {
                    throw new Error("Stream closed");
                  }),
                ]);
              } catch (error) {
                if (error instanceof Error && (error.message === "Stream closed" || !session.isActive)) {
                  logger.debug(`Session ${sessionId} closed, ending iterator`);
                  return { value: undefined, done: true };
                }
                logger.error(`Error waiting for events in session ${sessionId}:`, error);
                return { value: undefined, done: true };
              }
            }

            // Check again after waiting
            if (session.queue.length === 0 || !session.isActive) {
              logger.debug(`Session ${sessionId} queue empty or inactive, ending iterator`);
              return { value: undefined, done: true };
            }

            // Get the next event from the queue
            const nextEvent = session.queue.shift();
            if (!nextEvent) {
              logger.debug(`No event found in queue for session ${sessionId}`);
              return { value: undefined, done: true };
            }

            logger.debug(`Sending event for session ${sessionId}:`, Object.keys(nextEvent.event || {}));

            return {
              value: {
                chunk: {
                  bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                },
              },
              done: false,
            };
          } catch (error) {
            logger.error(`Error in session ${sessionId} iterator:`, error);
            session.isActive = false;
            return { value: undefined, done: true };
          }
        },
      }),
    };
  }

  private async processResponseStream(sessionId: string, response: any): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of response.body) {
        if (!session.isActive) {
          logger.info(`Session ${sessionId} is no longer active, stopping response processing`);
          break;
        }
        
        if (event.chunk?.bytes) {
          try {
            this.updateSessionActivity(sessionId);
            const textResponse = new TextDecoder().decode(event.chunk.bytes);

            try {
              const jsonResponse = JSON.parse(textResponse);
              if (jsonResponse.event?.contentStart) {
                this.dispatchEvent(sessionId, "contentStart", jsonResponse.event.contentStart);
              } else if (jsonResponse.event?.textOutput) {
                this.dispatchEvent(sessionId, "textOutput", jsonResponse.event.textOutput);
              } else if (jsonResponse.event?.audioOutput) {
                this.dispatchEvent(sessionId, "audioOutput", jsonResponse.event.audioOutput);
              } else if (jsonResponse.event?.contentEnd) {
                this.dispatchEvent(sessionId, "contentEnd", jsonResponse.event.contentEnd);
              } else {
                const eventKeys = Object.keys(jsonResponse.event || {});
                if (eventKeys.length > 0) {
                  this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
                }
              }
            } catch (e) {
              logger.debug(`Raw text response for session ${sessionId} (parse error): `, textResponse);
            }
          } catch (e) {
            logger.error(`Error processing response chunk for session ${sessionId}: `, e);
          }
        } else if (event.modelStreamErrorException) {
          logger.error(`Model stream error for session ${sessionId}: `, event.modelStreamErrorException);
          this.dispatchEvent(sessionId, "error", {
            type: "modelStreamErrorException",
            details: event.modelStreamErrorException,
          });
        }
      }

      logger.info(`Response stream processing complete for session ${sessionId}`);
    } catch (error) {
      logger.error(`Error processing response stream for session ${sessionId}: `, error);
      this.dispatchEvent(sessionId, "error", {
        source: "responseStream",
        message: "Error processing response stream",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private addEventToSessionQueue(sessionId: string, event: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.updateSessionActivity(sessionId);
    session.queue.push(event);
    session.queueSignal.next();
  }

  private setupSessionStartEvent(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        sessionStart: {
          inferenceConfiguration: session.inferenceConfig,
        },
      },
    });
  }

  private setupPromptStartEvent(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        promptStart: {
          promptName: session.promptName,
          textOutputConfiguration: {
            mediaType: "text/plain",
          },
          audioOutputConfiguration: DefaultAudioOutputConfiguration,
        },
      },
    });
    session.isPromptStartSent = true;
  }

  private setupSystemPromptEvent(sessionId: string, textConfig: any, systemPromptContent: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Store the system prompt in the session
    session.systemPrompt = systemPromptContent;

    const textPromptID = randomUUID();
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: textPromptID,
          type: "TEXT",
          interactive: true,
          role: "SYSTEM",
          textInputConfiguration: textConfig,
        },
      },
    });

    this.addEventToSessionQueue(sessionId, {
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: textPromptID,
          content: systemPromptContent,
        },
      },
    });

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: textPromptID,
        },
      },
    });
  }

  private setupStartAudioEvent(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: DefaultAudioInputConfiguration,
        },
      },
    });
    session.isAudioContentStartSent = true;
  }

  private async streamAudioChunk(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio streaming`);
    }
    
    const base64Data = audioData.toString("base64");
    this.addEventToSessionQueue(sessionId, {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64Data,
        },
      },
    });
  }

  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        logger.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
      }
    }
  }

  private async closeSession(sessionId: string): Promise<void> {
    if (this.sessionCleanupInProgress.has(sessionId)) {
      return;
    }
    
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.sessionCleanupInProgress.add(sessionId);
    try {
      session.isActive = false;
      session.closeSignal.next();
      session.closeSignal.complete();
      this.activeSessions.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }
}