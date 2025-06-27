import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import { take } from "rxjs/operators";
import { firstValueFrom } from "rxjs";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { WebSocket } from "ws";
import { logger } from './logger';
import { PromptService } from './services/PromptService';

// Types
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
  toolUseContent: any;
  toolUseId: string;
  toolName: string;
  responseHandlers: Map<string, (data: any) => void>;
  promptName: string;
  inferenceConfig: InferenceConfig;
  isActive: boolean;
  isPromptStartSent: boolean;
  isAudioContentStartSent: boolean;
  audioContentId: string;
  systemPrompt: string;
}

export interface NovaSonicBidirectionalStreamClientConfig {
  requestHandlerConfig?: any;
  clientConfig: {
    region?: string;
    credentials?: any;
  };
  inferenceConfig?: InferenceConfig;
}

// Constants
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

// Default system prompt moved to PromptService

## Response Templates (Maximum 25 words each)

### "Tell me about the show"
"Professional illusion entertainment followed by separate Gospel presentation - proven to reach unchurched families. Mike Lawrence can demonstrate this in 15 minutes. What day works?"

### "How much does it cost?"
"Mike Lawrence explains investment and funding options in our meeting. Many churches find creative ways to make events self-supporting. When's best for you?"

### "We're not interested in magic"
"Understood. This is biblical theatrical illusion for outreach, completely different from condemned practices. Mike Lawrence can explain the distinction. What time works?"

### "We don't have budget"
"That's exactly why Mike Lawrence should explain the funding strategies. Most churches are surprised how affordable this is. When could you meet?"

### "We're too busy"
"Perfect - this systematic approach actually reduces your workload while increasing outreach effectiveness. Just 15 minutes with Mike Lawrence. This week or next?"

### "Send information instead"
"Absolutely will follow up, but the 15-minute demonstration shows impact much better than materials. What's your preferred meeting time?"

### "What's your website?"
"Globaloutreachevent.com. But Mike Lawrence can walk you through everything in 15 minutes much better. What day works for you?"

### "Who would attend the meeting?"
"Just you and Mike Lawrence - I'm only scheduling. Fifteen minutes to see how this reaches your community. Morning or afternoon better?"

### "We already do outreach"
"Excellent! Mike Lawrence can show how this complements your current efforts with proven results. What time works for a quick meeting?"

## Objection Handling Pattern
1. **Acknowledge**: "I understand" or "That makes sense"
2. **Redirect**: "Mike Lawrence can address that in our meeting"
3. **Schedule**: "What day works?" or "This week or next?"

## Scheduling Language
- **Time flexibility**: "What works best for you?" "Any time that's convenient"
- **This week or next**: Creates urgency without pressure
- **Platform flexibility**: "Zoom, Teams, or whatever you prefer"
- **Confirmation**: "Perfect! Mike Lawrence will send the meeting details"

## Power Phrases for Credibility
- "Celebrity endorsed by Howie Mandel and Kelly Ripa"
- "Andre Kole's proven methodology"
- "Over 100,000 decisions for Christ"
- "We work exclusively with churches"
- "Reaches unchurched families"
- "Off-Broadway quality"

## What Makes You Different
- **Professional quality**: "Off-Broadway level entertainment"
- **Proven results**: "Andre Kole's methodology, 100,000+ decisions"
- **Celebrity credibility**: "Endorsed by Howie Mandel & Kelly Ripa"
- **Church focused**: "We work exclusively with churches"
- **Separate Gospel**: "Entertainment then Gospel, not mixed"

## Emergency Responses
If you can't handle a question briefly:
"Mike Lawrence can explain that perfectly in our 15-minute meeting. What's the best day for you?"

If pressed for technical details:
"I'm just the scheduling assistant - Mike Lawrence has all those details. When could you meet with him?"

## Critical Contact Information
- **Website**: globaloutreachevent.com
- **Mike Lawrence Direct**: 347-200-5533
- **Meeting Format**: Pastor + Mike Lawrence only (never mention Esther attending)

## Conversation Enders
- "Perfect! Mike Lawrence will send the meeting details."
- "Excellent! He'll follow up with the meeting link."
- "Great! You'll hear from Mike Lawrence with the details."

## Success Metrics to Aim For
- Keep calls under 3 minutes when possible
- Get specific day/time commitment
- Confirm pastor's direct involvement
- End with clear next steps

## Red Flags to Avoid
- ❌ Never give lengthy explanations
- ❌ Never promise to attend meetings yourself
- ❌ Never get into theological debates
- ❌ Never quote prices or specific numbers
- ❌ Never repeat email addresses or names out loud

## Green Lights to Pursue
- ✅ Always lead with celebrity endorsement + Andre Kole legacy
- ✅ Always redirect everything to Mike Lawrence meeting
- ✅ Always agree to their preferred time
- ✅ Always end with confirmation of next steps
- ✅ Always maintain warm, professional church tone`;

// StreamSession class
export class StreamSession {
  private audioBufferQueue: Buffer[] = [];
  private maxQueueSize = 200;
  private isProcessingAudio = false;
  private isActive = true;

  constructor(
    private sessionId: string,
    private client: NovaSonicBidirectionalStreamClient
  ) {}

  public onEvent(
    eventType: string,
    handler: (data: any) => void
  ): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this;
  }

  public async setupPromptStart(): Promise<void> {
    this.client.setupPromptStartEvent(this.sessionId);
  }

  public async setupSystemPrompt(
    textConfig: typeof DefaultTextConfiguration = DefaultTextConfiguration,
    systemPromptContent?: string
  ): Promise<void> {
    this.client.setupSystemPromptEvent(
      this.sessionId,
      textConfig,
      systemPromptContent
    );
  }

  public async setupStartAudio(
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration
  ): Promise<void> {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }

  public async streamAudio(audioData: Buffer): Promise<void> {
    logger.info('🎤 StreamSession.streamAudio called', { 
      sessionId: this.sessionId,
      audioSize: audioData.length,
      queueLength: this.audioBufferQueue.length 
    });

    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      this.audioBufferQueue.shift();
      logger.debug(`Audio queue full, dropping oldest chunk`, { sessionId: this.sessionId });
    }

    this.audioBufferQueue.push(audioData);
    logger.info('🔄 Audio added to queue, processing...', { 
      sessionId: this.sessionId,
      newQueueLength: this.audioBufferQueue.length 
    });
    this.processAudioQueue();
  }

  private async processAudioQueue() {
    if (
      this.isProcessingAudio ||
      this.audioBufferQueue.length === 0 ||
      !this.isActive
    )
      return;

    this.isProcessingAudio = true;
    try {
      let processedChunks = 0;
      const maxChunksPerBatch = 5;

      while (
        this.audioBufferQueue.length > 0 &&
        processedChunks < maxChunksPerBatch &&
        this.isActive
      ) {
        const audioChunk = this.audioBufferQueue.shift();
        if (audioChunk) {
          await this.client.streamAudioChunk(this.sessionId, audioChunk);
          processedChunks++;
        }
      }
    } finally {
      this.isProcessingAudio = false;

      if (this.audioBufferQueue.length > 0 && this.isActive) {
        setTimeout(() => this.processAudioQueue(), 0);
      }
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public async endAudioContent(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendContentEnd(this.sessionId);
  }

  public async endPrompt(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendPromptEnd(this.sessionId);
  }

  public async close(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;
    this.audioBufferQueue = [];

    await this.client.sendSessionEnd(this.sessionId);
    logger.info(`Session ${this.sessionId} close completed`);
  }
}

// Main client class
export class NovaSonicBidirectionalStreamClient {
  private bedrockRuntimeClient: BedrockRuntimeClient;
  private inferenceConfig: InferenceConfig;
  private activeSessions: Map<string, SessionData> = new Map();
  private sessionLastActivity: Map<string, number> = new Map();
  private sessionCleanupInProgress = new Set<string>();
  public contentNames: Map<string, string> = new Map();
  private promptService: PromptService;

  constructor(config: NovaSonicBidirectionalStreamClientConfig) {
    const nodeHttp2Handler = new NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
      ...config.requestHandlerConfig,
    });

    if (!config.clientConfig.credentials) {
      config.clientConfig.credentials = fromNodeProviderChain();
    }

    this.bedrockRuntimeClient = new BedrockRuntimeClient({
      ...config.clientConfig,
      credentials: config.clientConfig.credentials,
      region: config.clientConfig.region || "us-east-1",
      requestHandler: nodeHttp2Handler,
    });

    this.inferenceConfig = config.inferenceConfig ?? {
      maxTokens: 1024,
      topP: 0.9,
      temperature: 0.7,
    };

    this.promptService = new PromptService();

    logger.info('NovaSonicBidirectionalStreamClient initialized');
  }

  isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return !!session && session.isActive;
  }

  public getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  public getLastActivityTime(sessionId: string): number {
    return this.sessionLastActivity.get(sessionId) || 0;
  }

  private updateSessionActivity(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  public isCleanupInProgress(sessionId: string): boolean {
    return this.sessionCleanupInProgress.has(sessionId);
  }

  public async createStreamSession(
    sessionId: string = randomUUID(),
    config?: NovaSonicBidirectionalStreamClientConfig,
    assistantName: string = 'default'
  ): Promise<StreamSession> {
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Stream session with ID ${sessionId} already exists`);
    }

    // Fetch the prompt from S3
    const systemPrompt = await this.promptService.getPrompt(assistantName);
    logger.info('Fetched system prompt for assistant', { 
      assistantName, 
      promptLength: systemPrompt.length 
    });

    const session: SessionData = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      responseSubject: new Subject<any>(),
      toolUseContent: null,
      toolUseId: "",
      toolName: "",
      responseHandlers: new Map(),
      promptName: randomUUID(),
      inferenceConfig: config?.inferenceConfig ?? this.inferenceConfig,
      isActive: true,
      isPromptStartSent: false,
      isAudioContentStartSent: false,
      audioContentId: randomUUID(),
      systemPrompt: systemPrompt,
    };

    this.activeSessions.set(sessionId, session);

    return new StreamSession(sessionId, this);
  }

  public async initiateSession(
    sessionId: string,
    ws: WebSocket
  ): Promise<void> {
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

      await this.processResponseStream(sessionId, ws, response);
    } catch (error) {
      logger.error(`Error in session ${sessionId}: `, error);
      this.dispatchEventForSession(sessionId, "error", {
        source: "bidirectionalStream",
        error,
      });

      if (session.isActive) this.closeSession(sessionId);
    }
  }

  public registerEventHandler(
    sessionId: string,
    eventType: string,
    handler: (data: any) => void
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    session.responseHandlers.set(eventType, handler);
  }

  private dispatchEventForSession(
    sessionId: string,
    eventType: string,
    data: any
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        logger.error(`Error in ${eventType} handler for session ${sessionId}: `, e);
      }
    }

    const anyHandler = session.responseHandlers.get("any");
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        logger.error(`Error in 'any' handler for session ${sessionId}: `, e);
      }
    }
  }

  private createSessionAsyncIterable(
    sessionId: string
  ): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.debug(`Cannot create async iterable: Session ${sessionId} not active`);
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true }),
        }),
      };
    }

    // Create a combined iterator that handles both initial events and ongoing audio
    return {
      [Symbol.asyncIterator]: () => {
        let initialEventsSent = false;
        let eventIndex = 0;
        
        // Define initial events
        const systemContentId = randomUUID();
        const initialEvents = [
          // 1. Session start
          {
            event: {
              sessionStart: {
                inferenceConfiguration: session.inferenceConfig,
              },
            },
          },
          // 2. Prompt start  
          {
            event: {
              promptStart: {
                promptName: session.promptName,
                textOutputConfiguration: {
                  mediaType: "text/plain",
                },
                audioOutputConfiguration: DefaultAudioOutputConfiguration,
              },
            },
          },
          // 3. System prompt content start
          {
            event: {
              contentStart: {
                promptName: session.promptName,
                contentName: systemContentId,
                type: "TEXT",
                interactive: true,
                role: "SYSTEM",
                textInputConfiguration: {
                  mediaType: "text/plain",
                },
              },
            },
          },
          // 4. System prompt text
          {
            event: {
              textInput: {
                promptName: session.promptName,
                contentName: systemContentId,
                content: session.systemPrompt,
              },
            },
          },
          // 5. System prompt content end
          {
            event: {
              contentEnd: {
                promptName: session.promptName,
                contentName: systemContentId,
              },
            },
          },
          // 6. Audio content start
          {
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
          },
        ];

        logger.info(`Created ${initialEvents.length} initial events for session ${sessionId}`);
        
        return {
          next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
            try {
              if (!session.isActive) {
                logger.debug(`Session ${sessionId} not active, iterator done`);
                return { value: undefined, done: true };
              }

              // Send initial events first
              if (!initialEventsSent) {
                if (eventIndex < initialEvents.length) {
                  const event = initialEvents[eventIndex];
                  eventIndex++;
                  
                  const eventType = Object.keys(event.event)[0];
                  logger.info(`Sending initial event ${eventIndex}/${initialEvents.length} for session ${sessionId}:`, eventType);
                  
                  // Log system prompt specifically
                  if (eventType === 'textInput' && event.event.textInput?.content) {
                    logger.info('🎯 SENDING SYSTEM PROMPT TO NOVA SONIC', {
                      sessionId,
                      promptLength: event.event.textInput.content.length,
                      promptPreview: event.event.textInput.content.substring(0, 100) + '...'
                    });
                  }

                  return {
                    value: {
                      chunk: {
                        bytes: new TextEncoder().encode(JSON.stringify(event)),
                      },
                    },
                    done: false,
                  };
                } else {
                  initialEventsSent = true;
                  logger.info(`✅ All initial events sent for session ${sessionId}, now handling audio queue`);
                }
              }

              // Check for queued events (audio input, content end, prompt end, etc.)
              if (session.queue.length > 0) {
                const event = session.queue.shift();
                const eventType = Object.keys(event.event)[0];
                logger.debug(`Sending queued ${eventType} event for session ${sessionId}`);
                
                return {
                  value: {
                    chunk: {
                      bytes: new TextEncoder().encode(JSON.stringify(event)),
                    },
                  },
                  done: false,
                };
              }

              // Use timeout to avoid indefinite blocking
              try {
                const timeoutPromise = new Promise<void>((_, reject) => 
                  setTimeout(() => reject(new Error('timeout')), 5000)
                );
                
                const queueSignalPromise = firstValueFrom(session.queueSignal.pipe(take(1)));
                
                await Promise.race([queueSignalPromise, timeoutPromise]);
                
                // Check if session was closed while waiting
                if (!session.isActive) {
                  return { value: undefined, done: true };
                }

                // Process the next queued event if available
                if (session.queue.length > 0) {
                  const event = session.queue.shift();
                  const eventType = Object.keys(event.event)[0];
                  logger.debug(`Sending queued ${eventType} event for session ${sessionId}`);
                  
                  return {
                    value: {
                      chunk: {
                        bytes: new TextEncoder().encode(JSON.stringify(event)),
                      },
                    },
                    done: false,
                  };
                }
              } catch (error) {
                // Timeout or other error - continue processing
                logger.debug(`Queue wait timeout/error for session ${sessionId}, continuing...`);
              }

              // No events to process, keep waiting
              return { value: undefined, done: true };
              
            } catch (error) {
              logger.error(`Error in session ${sessionId} iterator: `, error);
              session.isActive = false;
              return { value: undefined, done: true };
            }
          },
        };
      },
    };
  }

  private async processResponseStream(
    sessionId: string,
    ws: WebSocket,
    response: any
  ): Promise<void> {
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
                this.dispatchEventForSession(
                  sessionId,
                  "contentStart",
                  jsonResponse.event.contentStart
                );
              } else if (jsonResponse.event?.textOutput) {
                this.dispatchEventForSession(
                  sessionId,
                  "textOutput",
                  jsonResponse.event.textOutput
                );
              } else if (jsonResponse.event?.audioOutput) {
                this.dispatchEventForSession(
                  sessionId,
                  "audioOutput",
                  jsonResponse.event.audioOutput
                );
              } else if (jsonResponse.event?.contentEnd) {
                this.dispatchEventForSession(
                  sessionId,
                  "contentEnd",
                  jsonResponse.event.contentEnd
                );
              } else {
                const eventKeys = Object.keys(jsonResponse.event || {});
                if (eventKeys.length > 0) {
                  this.dispatchEventForSession(sessionId, eventKeys[0], jsonResponse.event);
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
          this.dispatchEventForSession(sessionId, "error", {
            type: "modelStreamErrorException",
            details: event.modelStreamErrorException,
          });
        }
      }

      logger.info(`Response stream processing complete for session ${sessionId}`);
    } catch (error) {
      logger.error(`Error processing response stream for session ${sessionId}: `, error);
      this.dispatchEventForSession(sessionId, "error", {
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

  public setupPromptStartEvent(sessionId: string): void {
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

  public setupSystemPromptEvent(
    sessionId: string,
    textConfig: any,
    systemPromptContent?: string
  ): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Use provided prompt or fall back to session's prompt
    const promptToUse = systemPromptContent || session.systemPrompt;
    
    // Store the system prompt in the session for use in async iterable
    session.systemPrompt = promptToUse;
    logger.info('📝 Stored system prompt in session', {
      sessionId,
      promptLength: promptToUse.length,
      promptPreview: promptToUse.substring(0, 100) + '...'
    });

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
          content: promptToUse,
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

  public setupStartAudioEvent(
    sessionId: string,
    audioConfig: typeof DefaultAudioInputConfiguration = DefaultAudioInputConfiguration
  ): void {
    logger.info(`Setting up startAudioContent event for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    logger.info(`Using audio content ID: ${session.audioContentId}`);
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      },
    });
    session.isAudioContentStartSent = true;
  }

  public async streamAudioChunk(sessionId: string, audioData: Buffer): Promise<void> {
    logger.info('🎯 streamAudioChunk called', { sessionId, audioSize: audioData.length });
    
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio streaming`);
    }

    const base64Data = audioData.toString("base64");
    logger.info('📡 Adding audioInput event to queue', { 
      sessionId, 
      audioContentId: session.audioContentId,
      base64Length: base64Data.length 
    });
    
    this.addEventToSessionQueue(sessionId, {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64Data,
        },
      },
    });
    
    logger.info('✅ audioInput event queued', { sessionId });
  }

  public async sendContentEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    if (session.audioContentId) {
      this.addEventToSessionQueue(sessionId, {
        event: {
          contentEnd: {
            promptName: session.promptName,
            contentName: session.audioContentId,
          },
        },
      });
    }
  }

  public async sendPromptEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        promptEnd: {
          promptName: session.promptName,
        },
      },
    });
  }

  public async sendSessionEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.addEventToSessionQueue(sessionId, {
      event: {
        sessionEnd: {},
      },
    });
  }

  public closeSession(sessionId: string): void {
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