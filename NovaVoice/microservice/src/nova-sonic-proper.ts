/**
 * Proper Nova Sonic Bidirectional Streaming Implementation
 * Based on AWS Samples GitHub repository
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from './logger';

interface SessionData {
  sessionId: string;
  promptName: string;
  contentName: string;
  isActive: boolean;
  startTime: number;
  transcript: string[];
  queue: any[];
  stream?: any;
}

class StreamSession {
  constructor(
    private sessionId: string,
    private client: NovaSonicProperClient
  ) {}

  public onEvent(eventType: string, handler: (data: any) => void): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  public async setupPromptStart(): Promise<void> {
    this.client.setupPromptStartEvent(this.sessionId);
  }

  public async setupSystemPrompt(textConfig?: any, systemPromptContent?: string): Promise<void> {
    this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
  }

  public async setupStartAudio(audioConfig?: any): Promise<void> {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  public async streamAudio(audioData: Buffer): Promise<void> {
    await this.client.sendAudio(this.sessionId, audioData);
  }

  public async close(): Promise<void> {
    await this.client.endSession(this.sessionId);
  }
}

export class NovaSonicProperClient extends EventEmitter {
  private client: BedrockRuntimeClient;
  private sessions = new Map<string, SessionData>();
  private modelId = 'amazon.nova-sonic-v1:0';

  constructor() {
    super();
    
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttp2Handler({
        maxConcurrentStreams: 10,
      }),
    });

    logger.info('Nova Sonic Proper Client initialized', {
      region: process.env.AWS_REGION || 'us-east-1',
      modelId: this.modelId
    });
  }

  async startSession(sessionId: string, systemPrompt: string): Promise<void> {
    try {
      logger.info('Starting Nova Sonic bidirectional stream', { sessionId });

      const promptName = randomUUID();
      const contentName = randomUUID();

      // Create session data
      const sessionData: SessionData = {
        sessionId,
        promptName,
        contentName,
        isActive: true,
        startTime: Date.now(),
        transcript: [],
        queue: []
      };

      // Prepare initialization events
      sessionData.queue = [
        // Start session event
        {
          event: {
            startSession: {}
          }
        },
        // Prompt start event
        {
          event: {
            promptStart: {
              promptName: promptName
            }
          }
        },
        // Text content start event
        {
          event: {
            contentStart: {
              promptName: promptName,
              contentName: randomUUID(),
              type: "TEXT"
            }
          }
        },
        // System prompt
        {
          event: {
            textInput: {
              promptName: promptName,
              contentName: randomUUID(),
              content: systemPrompt
            }
          }
        },
        // Content end for system prompt
        {
          event: {
            contentEnd: {
              promptName: promptName,
              contentName: randomUUID()
            }
          }
        },
        // Audio content start event
        {
          event: {
            contentStart: {
              promptName: promptName,
              contentName: contentName,
              type: "AUDIO",
              interactive: true,
              audioInputConfiguration: {
                mediaType: "audio/lpcm",
                sampleRateHertz: 16000
              }
            }
          }
        }
      ];

      // Create async iterable for the queue
      const asyncIterable = this.createAsyncIterable(sessionId);

      // Start the bidirectional stream
      const command = new InvokeModelWithBidirectionalStreamCommand({
        modelId: this.modelId,
        body: asyncIterable,
      });

      const response = await this.client.send(command);
      sessionData.stream = response;
      this.sessions.set(sessionId, sessionData);

      // Process the response stream
      this.processResponseStream(sessionId, response);
      
      this.emit('sessionStarted', sessionId);
      logger.info('Nova Sonic bidirectional stream started', { sessionId });

    } catch (error: any) {
      logger.error('Failed to start Nova Sonic session', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  private createAsyncIterable(sessionId: string): AsyncIterable<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      [Symbol.asyncIterator]: () => {
        return {
          next: async (): Promise<IteratorResult<any>> => {
            const currentSession = this.sessions.get(sessionId);
            if (!currentSession || !currentSession.isActive) {
              return { value: undefined, done: true };
            }

            if (currentSession.queue.length === 0) {
              // Wait for new events with timeout
              await new Promise(resolve => setTimeout(resolve, 50));
              if (currentSession.queue.length === 0) {
                // Return empty chunk to keep connection alive
                return {
                  value: {
                    chunk: {
                      bytes: new TextEncoder().encode('{}')
                    }
                  },
                  done: false
                };
              }
            }

            const event = currentSession.queue.shift();
            if (!event) {
              return { value: undefined, done: true };
            }

            return {
              value: {
                chunk: {
                  bytes: new TextEncoder().encode(JSON.stringify(event))
                }
              },
              done: false
            };
          }
        };
      }
    };
  }

  private async processResponseStream(sessionId: string, response: any) {
    try {
      if (response.body) {
        for await (const event of response.body) {
          if (event.chunk) {
            const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
            
            if (chunkData.event?.audioOutput) {
              const audioData = chunkData.event.audioOutput;
              this.dispatchEvent(sessionId, 'audioOutput', audioData);
              
              logger.debug('Received audio from Nova Sonic', {
                sessionId,
                audioSize: audioData.content?.length || 0
              });
            }

            if (chunkData.event?.textOutput) {
              const textData = chunkData.event.textOutput;
              const session = this.sessions.get(sessionId);
              if (session && textData.content) {
                session.transcript.push(textData.content);
              }
              
              this.dispatchEvent(sessionId, 'textOutput', textData);
              logger.info('Received text from Nova Sonic', { sessionId, text: textData.content });
            }

            if (chunkData.event?.contentEnd) {
              logger.info('Nova Sonic content end', { sessionId });
              this.dispatchEvent(sessionId, 'contentEnd', chunkData.event.contentEnd);
            }
          }
        }
      }
    } catch (error: any) {
      logger.error('Error processing Nova Sonic response stream', {
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
      const audioBase64 = audioData.toString('base64');
      
      // Create audio input event
      const audioEvent = {
        event: {
          audioInput: {
            promptName: session.promptName,
            contentName: session.contentName,
            content: audioBase64
          }
        }
      };

      // Add to queue
      session.queue.push(audioEvent);
      
      logger.debug('Queued audio for Nova Sonic', {
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
      
      // Send content end event
      const endEvent = {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName: session.contentName
          }
        }
      };
      
      session.queue.push(endEvent);
      
      // Clean up after a delay
      setTimeout(() => {
        this.sessions.delete(sessionId);
      }, 1000);
      
      logger.info('Nova Sonic session ended', { 
        sessionId,
        duration: Date.now() - session.startTime,
        transcriptLength: session.transcript.length
      });

      this.emit('sessionEnded', sessionId);

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

  // Methods to match PoC interface
  createStreamSession(sessionId: string): StreamSession {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Stream session with ID ${sessionId} already exists`);
    }

    const sessionData: SessionData = {
      sessionId,
      promptName: `prompt-${sessionId}`,
      contentName: `content-${sessionId}`,
      isActive: true,
      startTime: Date.now(),
      transcript: [],
      queue: []
    };

    this.sessions.set(sessionId, sessionData);
    return new StreamSession(sessionId, this);
  }

  async initiateSession(sessionId: string): Promise<void> {
    return this.startSession(sessionId, this.getDefaultSystemPrompt());
  }

  setupPromptStartEvent(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.queue.push({
      event: {
        promptStart: {
          promptName: session.promptName
        }
      }
    });
  }

  setupSystemPromptEvent(sessionId: string, textConfig?: any, systemPromptContent?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const prompt = systemPromptContent || this.getDefaultSystemPrompt();
    
    // Text content start
    session.queue.push({
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: `text-${sessionId}`,
          type: "TEXT"
        }
      }
    });

    // System prompt text
    session.queue.push({
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: `text-${sessionId}`,
          content: prompt
        }
      }
    });

    // Text content end
    session.queue.push({
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: `text-${sessionId}`
        }
      }
    });
  }

  setupStartAudioEvent(sessionId: string, audioConfig?: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.queue.push({
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.contentName,
          type: "AUDIO",
          interactive: true,
          audioInputConfiguration: {
            mediaType: "audio/lpcm",
            sampleRateHertz: 16000
          }
        }
      }
    });
  }

  registerEventHandler(sessionId: string, eventType: string, handler: (data: any) => void): void {
    // Store event handlers for this session
    const session = this.sessions.get(sessionId);
    if (session) {
      if (!(session as any).eventHandlers) {
        (session as any).eventHandlers = new Map();
      }
      (session as any).eventHandlers.set(eventType, handler);
    }
  }

  private getDefaultSystemPrompt(): string {
    return `You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program. 
    Key Facts: Program is two-phase outreach (entertainment THEN Gospel presentation), 
    Format is 40-50 min Off-Broadway illusion show + 30 min separate Gospel message, 
    Track Record similar to Campus Crusade approach (~100,000 decisions).
    When asked who attends: The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you.
    Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.
    Website: globaloutreachevent.com, Mike Lawrence Direct Number: 347-300-5533
    
    IMPORTANT: Respond with both speech audio and text. Provide clear, natural speech responses.`;
  }

  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const eventHandlers = (session as any).eventHandlers;
    if (eventHandlers) {
      const handler = eventHandlers.get(eventType);
      if (handler) {
        try {
          handler(data);
        } catch (e) {
          logger.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
        }
      }
    }

    // Also emit traditional events
    this.emit(eventType, sessionId, data);
  }
}