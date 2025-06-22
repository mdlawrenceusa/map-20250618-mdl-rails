"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicBidirectionalStreamClient = exports.StreamSession = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const rxjs_2 = require("rxjs");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const logger_1 = require("./logger");
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
const DefaultSystemPrompt = `You are Esther, Mike Lawrence Productions' scheduling assistant. 
Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program.
Keep responses brief (under 25 words) and always redirect to scheduling.`;
// StreamSession class
class StreamSession {
    constructor(sessionId, client) {
        this.sessionId = sessionId;
        this.client = client;
        this.audioBufferQueue = [];
        this.maxQueueSize = 200;
        this.isProcessingAudio = false;
        this.isActive = true;
    }
    onEvent(eventType, handler) {
        this.client.registerEventHandler(this.sessionId, eventType, handler);
        return this;
    }
    async setupPromptStart() {
        this.client.setupPromptStartEvent(this.sessionId);
    }
    async setupSystemPrompt(textConfig = DefaultTextConfiguration, systemPromptContent = DefaultSystemPrompt) {
        this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
    }
    async setupStartAudio(audioConfig = DefaultAudioInputConfiguration) {
        this.client.setupStartAudioEvent(this.sessionId, audioConfig);
    }
    async streamAudio(audioData) {
        logger_1.logger.info('🎤 StreamSession.streamAudio called', {
            sessionId: this.sessionId,
            audioSize: audioData.length,
            queueLength: this.audioBufferQueue.length
        });
        if (this.audioBufferQueue.length >= this.maxQueueSize) {
            this.audioBufferQueue.shift();
            logger_1.logger.debug(`Audio queue full, dropping oldest chunk`, { sessionId: this.sessionId });
        }
        this.audioBufferQueue.push(audioData);
        logger_1.logger.info('🔄 Audio added to queue, processing...', {
            sessionId: this.sessionId,
            newQueueLength: this.audioBufferQueue.length
        });
        this.processAudioQueue();
    }
    async processAudioQueue() {
        if (this.isProcessingAudio ||
            this.audioBufferQueue.length === 0 ||
            !this.isActive)
            return;
        this.isProcessingAudio = true;
        try {
            let processedChunks = 0;
            const maxChunksPerBatch = 5;
            while (this.audioBufferQueue.length > 0 &&
                processedChunks < maxChunksPerBatch &&
                this.isActive) {
                const audioChunk = this.audioBufferQueue.shift();
                if (audioChunk) {
                    await this.client.streamAudioChunk(this.sessionId, audioChunk);
                    processedChunks++;
                }
            }
        }
        finally {
            this.isProcessingAudio = false;
            if (this.audioBufferQueue.length > 0 && this.isActive) {
                setTimeout(() => this.processAudioQueue(), 0);
            }
        }
    }
    getSessionId() {
        return this.sessionId;
    }
    async endAudioContent() {
        if (!this.isActive)
            return;
        await this.client.sendContentEnd(this.sessionId);
    }
    async endPrompt() {
        if (!this.isActive)
            return;
        await this.client.sendPromptEnd(this.sessionId);
    }
    async close() {
        if (!this.isActive)
            return;
        this.isActive = false;
        this.audioBufferQueue = [];
        await this.client.sendSessionEnd(this.sessionId);
        logger_1.logger.info(`Session ${this.sessionId} close completed`);
    }
}
exports.StreamSession = StreamSession;
// Main client class
class NovaSonicBidirectionalStreamClient {
    constructor(config) {
        var _a;
        this.activeSessions = new Map();
        this.sessionLastActivity = new Map();
        this.sessionCleanupInProgress = new Set();
        this.contentNames = new Map();
        const nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 300000,
            sessionTimeout: 300000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
            ...config.requestHandlerConfig,
        });
        if (!config.clientConfig.credentials) {
            config.clientConfig.credentials = (0, credential_providers_1.fromNodeProviderChain)();
        }
        this.bedrockRuntimeClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            ...config.clientConfig,
            credentials: config.clientConfig.credentials,
            region: config.clientConfig.region || "us-east-1",
            requestHandler: nodeHttp2Handler,
        });
        this.inferenceConfig = (_a = config.inferenceConfig) !== null && _a !== void 0 ? _a : {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.7,
        };
        logger_1.logger.info('NovaSonicBidirectionalStreamClient initialized');
    }
    isSessionActive(sessionId) {
        const session = this.activeSessions.get(sessionId);
        return !!session && session.isActive;
    }
    getActiveSessions() {
        return Array.from(this.activeSessions.keys());
    }
    getLastActivityTime(sessionId) {
        return this.sessionLastActivity.get(sessionId) || 0;
    }
    updateSessionActivity(sessionId) {
        this.sessionLastActivity.set(sessionId, Date.now());
    }
    isCleanupInProgress(sessionId) {
        return this.sessionCleanupInProgress.has(sessionId);
    }
    createStreamSession(sessionId = (0, node_crypto_1.randomUUID)(), config) {
        var _a;
        if (this.activeSessions.has(sessionId)) {
            throw new Error(`Stream session with ID ${sessionId} already exists`);
        }
        const session = {
            queue: [],
            queueSignal: new rxjs_1.Subject(),
            closeSignal: new rxjs_1.Subject(),
            responseSubject: new rxjs_1.Subject(),
            toolUseContent: null,
            toolUseId: "",
            toolName: "",
            responseHandlers: new Map(),
            promptName: (0, node_crypto_1.randomUUID)(),
            inferenceConfig: (_a = config === null || config === void 0 ? void 0 : config.inferenceConfig) !== null && _a !== void 0 ? _a : this.inferenceConfig,
            isActive: true,
            isPromptStartSent: false,
            isAudioContentStartSent: false,
            audioContentId: (0, node_crypto_1.randomUUID)(),
        };
        this.activeSessions.set(sessionId, session);
        return new StreamSession(sessionId, this);
    }
    async initiateSession(sessionId, ws) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Stream session ${sessionId} not found`);
        }
        try {
            this.setupSessionStartEvent(sessionId);
            const asyncIterable = this.createSessionAsyncIterable(sessionId);
            logger_1.logger.info(`Starting bidirectional stream for session ${sessionId}...`);
            const response = await this.bedrockRuntimeClient.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
                modelId: "amazon.nova-sonic-v1:0",
                body: asyncIterable,
            }));
            logger_1.logger.info(`Stream established for session ${sessionId}, processing responses...`);
            await this.processResponseStream(sessionId, ws, response);
        }
        catch (error) {
            logger_1.logger.error(`Error in session ${sessionId}: `, error);
            this.dispatchEventForSession(sessionId, "error", {
                source: "bidirectionalStream",
                error,
            });
            if (session.isActive)
                this.closeSession(sessionId);
        }
    }
    registerEventHandler(sessionId, eventType, handler) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        session.responseHandlers.set(eventType, handler);
    }
    dispatchEventForSession(sessionId, eventType, data) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        const handler = session.responseHandlers.get(eventType);
        if (handler) {
            try {
                handler(data);
            }
            catch (e) {
                logger_1.logger.error(`Error in ${eventType} handler for session ${sessionId}: `, e);
            }
        }
        const anyHandler = session.responseHandlers.get("any");
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data });
            }
            catch (e) {
                logger_1.logger.error(`Error in 'any' handler for session ${sessionId}: `, e);
            }
        }
    }
    createSessionAsyncIterable(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive) {
            logger_1.logger.debug(`Cannot create async iterable: Session ${sessionId} not active`);
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
                const systemContentId = (0, node_crypto_1.randomUUID)();
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
                                content: DefaultSystemPrompt,
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
                logger_1.logger.info(`Created ${initialEvents.length} initial events for session ${sessionId}`);
                return {
                    next: async () => {
                        try {
                            if (!session.isActive) {
                                logger_1.logger.debug(`Session ${sessionId} not active, iterator done`);
                                return { value: undefined, done: true };
                            }
                            // Send initial events first
                            if (!initialEventsSent) {
                                if (eventIndex < initialEvents.length) {
                                    const event = initialEvents[eventIndex];
                                    eventIndex++;
                                    logger_1.logger.info(`Sending initial event ${eventIndex}/${initialEvents.length} for session ${sessionId}:`, Object.keys(event.event)[0]);
                                    return {
                                        value: {
                                            chunk: {
                                                bytes: new TextEncoder().encode(JSON.stringify(event)),
                                            },
                                        },
                                        done: false,
                                    };
                                }
                                else {
                                    initialEventsSent = true;
                                    logger_1.logger.info(`✅ All initial events sent for session ${sessionId}, now handling audio queue`);
                                }
                            }
                            // Wait for queued events (audio input, content end, prompt end, etc.)
                            if (session.queue.length > 0) {
                                const event = session.queue.shift();
                                const eventType = Object.keys(event.event)[0];
                                logger_1.logger.debug(`Sending queued ${eventType} event for session ${sessionId}`);
                                return {
                                    value: {
                                        chunk: {
                                            bytes: new TextEncoder().encode(JSON.stringify(event)),
                                        },
                                    },
                                    done: false,
                                };
                            }
                            // Wait for new events using the queue signal
                            await (0, rxjs_2.firstValueFrom)(session.queueSignal.pipe((0, operators_1.take)(1)));
                            // Check if session was closed while waiting
                            if (!session.isActive) {
                                return { value: undefined, done: true };
                            }
                            // Process the next queued event
                            if (session.queue.length > 0) {
                                const event = session.queue.shift();
                                const eventType = Object.keys(event.event)[0];
                                logger_1.logger.debug(`Sending queued ${eventType} event for session ${sessionId}`);
                                return {
                                    value: {
                                        chunk: {
                                            bytes: new TextEncoder().encode(JSON.stringify(event)),
                                        },
                                    },
                                    done: false,
                                };
                            }
                            // No events available, wait for next signal
                            return { value: undefined, done: true };
                        }
                        catch (error) {
                            logger_1.logger.error(`Error in session ${sessionId} iterator: `, error);
                            session.isActive = false;
                            return { value: undefined, done: true };
                        }
                    },
                };
            },
        };
    }
    async processResponseStream(sessionId, ws, response) {
        var _a, _b, _c, _d, _e;
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        try {
            for await (const event of response.body) {
                if (!session.isActive) {
                    logger_1.logger.info(`Session ${sessionId} is no longer active, stopping response processing`);
                    break;
                }
                if ((_a = event.chunk) === null || _a === void 0 ? void 0 : _a.bytes) {
                    try {
                        this.updateSessionActivity(sessionId);
                        const textResponse = new TextDecoder().decode(event.chunk.bytes);
                        try {
                            const jsonResponse = JSON.parse(textResponse);
                            if ((_b = jsonResponse.event) === null || _b === void 0 ? void 0 : _b.contentStart) {
                                this.dispatchEventForSession(sessionId, "contentStart", jsonResponse.event.contentStart);
                            }
                            else if ((_c = jsonResponse.event) === null || _c === void 0 ? void 0 : _c.textOutput) {
                                this.dispatchEventForSession(sessionId, "textOutput", jsonResponse.event.textOutput);
                            }
                            else if ((_d = jsonResponse.event) === null || _d === void 0 ? void 0 : _d.audioOutput) {
                                this.dispatchEventForSession(sessionId, "audioOutput", jsonResponse.event.audioOutput);
                            }
                            else if ((_e = jsonResponse.event) === null || _e === void 0 ? void 0 : _e.contentEnd) {
                                this.dispatchEventForSession(sessionId, "contentEnd", jsonResponse.event.contentEnd);
                            }
                            else {
                                const eventKeys = Object.keys(jsonResponse.event || {});
                                if (eventKeys.length > 0) {
                                    this.dispatchEventForSession(sessionId, eventKeys[0], jsonResponse.event);
                                }
                            }
                        }
                        catch (e) {
                            logger_1.logger.debug(`Raw text response for session ${sessionId} (parse error): `, textResponse);
                        }
                    }
                    catch (e) {
                        logger_1.logger.error(`Error processing response chunk for session ${sessionId}: `, e);
                    }
                }
                else if (event.modelStreamErrorException) {
                    logger_1.logger.error(`Model stream error for session ${sessionId}: `, event.modelStreamErrorException);
                    this.dispatchEventForSession(sessionId, "error", {
                        type: "modelStreamErrorException",
                        details: event.modelStreamErrorException,
                    });
                }
            }
            logger_1.logger.info(`Response stream processing complete for session ${sessionId}`);
        }
        catch (error) {
            logger_1.logger.error(`Error processing response stream for session ${sessionId}: `, error);
            this.dispatchEventForSession(sessionId, "error", {
                source: "responseStream",
                message: "Error processing response stream",
                details: error instanceof Error ? error.message : String(error),
            });
        }
    }
    addEventToSessionQueue(sessionId, event) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive)
            return;
        this.updateSessionActivity(sessionId);
        session.queue.push(event);
        session.queueSignal.next();
    }
    setupSessionStartEvent(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        this.addEventToSessionQueue(sessionId, {
            event: {
                sessionStart: {
                    inferenceConfiguration: session.inferenceConfig,
                },
            },
        });
    }
    setupPromptStartEvent(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
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
    setupSystemPromptEvent(sessionId, textConfig, systemPromptContent) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        const textPromptID = (0, node_crypto_1.randomUUID)();
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
    setupStartAudioEvent(sessionId, audioConfig = DefaultAudioInputConfiguration) {
        logger_1.logger.info(`Setting up startAudioContent event for session ${sessionId}...`);
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        logger_1.logger.info(`Using audio content ID: ${session.audioContentId}`);
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
    async streamAudioChunk(sessionId, audioData) {
        logger_1.logger.info('🎯 streamAudioChunk called', { sessionId, audioSize: audioData.length });
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive || !session.audioContentId) {
            throw new Error(`Invalid session ${sessionId} for audio streaming`);
        }
        const base64Data = audioData.toString("base64");
        logger_1.logger.info('📡 Adding audioInput event to queue', {
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
        logger_1.logger.info('✅ audioInput event queued', { sessionId });
    }
    async sendContentEnd(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive)
            return;
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
    async sendPromptEnd(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive)
            return;
        this.addEventToSessionQueue(sessionId, {
            event: {
                promptEnd: {
                    promptName: session.promptName,
                },
            },
        });
    }
    async sendSessionEnd(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive)
            return;
        this.addEventToSessionQueue(sessionId, {
            event: {
                sessionEnd: {},
            },
        });
    }
    closeSession(sessionId) {
        if (this.sessionCleanupInProgress.has(sessionId)) {
            return;
        }
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        this.sessionCleanupInProgress.add(sessionId);
        try {
            session.isActive = false;
            session.closeSignal.next();
            session.closeSignal.complete();
            this.activeSessions.delete(sessionId);
            this.sessionLastActivity.delete(sessionId);
        }
        finally {
            this.sessionCleanupInProgress.delete(sessionId);
        }
    }
}
exports.NovaSonicBidirectionalStreamClient = NovaSonicBidirectionalStreamClient;
