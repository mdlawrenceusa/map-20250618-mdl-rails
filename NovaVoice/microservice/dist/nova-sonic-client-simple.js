"use strict";
/**
 * Nova Sonic Client with direct TypeScript implementation from PoC
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicClient = void 0;
const events_1 = require("events");
const logger_1 = require("./logger");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_buffer_1 = require("node:buffer");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const rxjs_2 = require("rxjs");
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
class NovaSonicClient extends events_1.EventEmitter {
    constructor() {
        super();
        this.activeSessions = new Map();
        this.sessionLastActivity = new Map();
        this.sessionCleanupInProgress = new Set();
        const nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 300000,
            sessionTimeout: 300000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
        });
        this.bedrockRuntimeClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            credentials: (0, credential_providers_1.fromNodeProviderChain)(),
            region: process.env.AWS_REGION || "us-east-1",
            requestHandler: nodeHttp2Handler,
        });
        this.inferenceConfig = {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.7,
        };
        logger_1.logger.info('Nova Sonic Client initialized (direct TypeScript implementation)');
    }
    async startSession(sessionId, systemPrompt) {
        try {
            logger_1.logger.info('Starting Nova Sonic session', { sessionId });
            if (this.activeSessions.has(sessionId)) {
                throw new Error(`Stream session with ID ${sessionId} already exists`);
            }
            const session = {
                queue: [],
                queueSignal: new rxjs_1.Subject(),
                closeSignal: new rxjs_1.Subject(),
                responseSubject: new rxjs_1.Subject(),
                responseHandlers: new Map(),
                promptName: (0, node_crypto_1.randomUUID)(),
                inferenceConfig: this.inferenceConfig,
                isActive: true,
                isPromptStartSent: false,
                isAudioContentStartSent: false,
                audioContentId: (0, node_crypto_1.randomUUID)(),
                startTime: Date.now(),
                transcript: [],
                systemPrompt: systemPrompt
            };
            this.activeSessions.set(sessionId, session);
            this.sessionLastActivity.set(sessionId, Date.now());
            // Set up event handlers
            session.responseHandlers.set('audioOutput', (data) => {
                const audioBuffer = node_buffer_1.Buffer.from(data.content, 'base64');
                this.emit('audioOutput', sessionId, audioBuffer);
                logger_1.logger.debug('Received audio from Nova Sonic', {
                    sessionId,
                    size: audioBuffer.length
                });
            });
            session.responseHandlers.set('textOutput', (data) => {
                session.transcript.push(data.content);
                this.emit('textOutput', sessionId, data.content);
                logger_1.logger.info('Received text from Nova Sonic', {
                    sessionId,
                    text: data.content
                });
            });
            session.responseHandlers.set('error', (data) => {
                logger_1.logger.error('Nova Sonic processing error', {
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
            logger_1.logger.info('Nova Sonic session started', { sessionId });
        }
        catch (error) {
            logger_1.logger.error('Failed to start Nova Sonic session', {
                sessionId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    async sendAudio(sessionId, audioData) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive) {
            logger_1.logger.warn('Attempted to send audio to inactive session', { sessionId });
            return;
        }
        // Check if audio content has been started
        if (!session.isAudioContentStartSent) {
            logger_1.logger.debug('Audio content not started yet, buffering audio', { sessionId });
            return;
        }
        try {
            logger_1.logger.debug('Sending audio to Nova Sonic', {
                sessionId,
                audioSize: audioData.length
            });
            // Stream audio directly to Nova Sonic
            await this.streamAudioChunk(sessionId, audioData);
            this.updateSessionActivity(sessionId);
        }
        catch (error) {
            logger_1.logger.error('Failed to send audio to Nova Sonic', {
                sessionId,
                error: error.message,
                stack: error.stack
            });
            this.emit('error', sessionId, error);
        }
    }
    async endSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return;
        }
        try {
            logger_1.logger.info('Nova Sonic session ended', {
                sessionId,
                duration: Date.now() - session.startTime,
                transcriptLength: session.transcript.length
            });
            await this.closeSession(sessionId);
            this.emit('sessionEnded', sessionId);
        }
        catch (error) {
            logger_1.logger.error('Error ending Nova Sonic session', {
                sessionId,
                error: error.message
            });
        }
    }
    getSessionTranscript(sessionId) {
        const session = this.activeSessions.get(sessionId);
        return session ? session.transcript : [];
    }
    isSessionActive(sessionId) {
        const session = this.activeSessions.get(sessionId);
        return session ? session.isActive : false;
    }
    getActiveSessions() {
        return Array.from(this.activeSessions.keys()).filter(sessionId => { var _a; return (_a = this.activeSessions.get(sessionId)) === null || _a === void 0 ? void 0 : _a.isActive; });
    }
    // Core Nova Sonic implementation methods from PoC
    updateSessionActivity(sessionId) {
        this.sessionLastActivity.set(sessionId, Date.now());
    }
    async setupPromptStart(sessionId) {
        logger_1.logger.info('Setting up prompt start', { sessionId });
        return new Promise((resolve) => {
            this.setupPromptStartEvent(sessionId);
            setTimeout(resolve, 100); // Allow time for event processing
        });
    }
    async setupSystemPrompt(sessionId, systemPrompt) {
        logger_1.logger.info('Setting up system prompt', { sessionId });
        return new Promise((resolve) => {
            this.setupSystemPromptEvent(sessionId, DefaultTextConfiguration, systemPrompt);
            setTimeout(resolve, 100); // Allow time for event processing
        });
    }
    async setupStartAudio(sessionId) {
        logger_1.logger.info('Setting up start audio', { sessionId });
        return new Promise((resolve) => {
            this.setupStartAudioEvent(sessionId);
            setTimeout(resolve, 100); // Allow time for event processing
        });
    }
    async initiateSession(sessionId) {
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
            // Process response stream in background
            this.processResponseStream(sessionId, response).catch(error => {
                logger_1.logger.error(`Error in response stream for session ${sessionId}:`, error);
                this.emit('error', sessionId, error);
            });
            // Give the stream a moment to stabilize before returning
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        catch (error) {
            logger_1.logger.error(`Error in session ${sessionId}: `, error);
            this.emit('error', sessionId, error);
            if (session.isActive)
                this.closeSession(sessionId);
        }
    }
    createSessionAsyncIterable(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Cannot create async iterable: Session ${sessionId} not found`);
        }
        return {
            [Symbol.asyncIterator]: () => ({
                next: async () => {
                    try {
                        if (!session.isActive || !this.activeSessions.has(sessionId)) {
                            logger_1.logger.debug(`Session ${sessionId} not active, ending iterator`);
                            return { value: undefined, done: true };
                        }
                        // Wait for events to be available or session to close
                        while (session.queue.length === 0 && session.isActive) {
                            try {
                                await Promise.race([
                                    (0, rxjs_2.firstValueFrom)(session.queueSignal.pipe((0, operators_1.take)(1))),
                                    (0, rxjs_2.firstValueFrom)(session.closeSignal.pipe((0, operators_1.take)(1))).then(() => {
                                        throw new Error("Stream closed");
                                    }),
                                ]);
                            }
                            catch (error) {
                                if (error instanceof Error && (error.message === "Stream closed" || !session.isActive)) {
                                    logger_1.logger.debug(`Session ${sessionId} closed, ending iterator`);
                                    return { value: undefined, done: true };
                                }
                                logger_1.logger.error(`Error waiting for events in session ${sessionId}:`, error);
                                return { value: undefined, done: true };
                            }
                        }
                        // Check again after waiting
                        if (session.queue.length === 0 || !session.isActive) {
                            logger_1.logger.debug(`Session ${sessionId} queue empty or inactive, ending iterator`);
                            return { value: undefined, done: true };
                        }
                        // Get the next event from the queue
                        const nextEvent = session.queue.shift();
                        if (!nextEvent) {
                            logger_1.logger.debug(`No event found in queue for session ${sessionId}`);
                            return { value: undefined, done: true };
                        }
                        logger_1.logger.debug(`Sending event for session ${sessionId}:`, Object.keys(nextEvent.event || {}));
                        return {
                            value: {
                                chunk: {
                                    bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                                },
                            },
                            done: false,
                        };
                    }
                    catch (error) {
                        logger_1.logger.error(`Error in session ${sessionId} iterator:`, error);
                        session.isActive = false;
                        return { value: undefined, done: true };
                    }
                },
            }),
        };
    }
    async processResponseStream(sessionId, response) {
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
                                this.dispatchEvent(sessionId, "contentStart", jsonResponse.event.contentStart);
                            }
                            else if ((_c = jsonResponse.event) === null || _c === void 0 ? void 0 : _c.textOutput) {
                                this.dispatchEvent(sessionId, "textOutput", jsonResponse.event.textOutput);
                            }
                            else if ((_d = jsonResponse.event) === null || _d === void 0 ? void 0 : _d.audioOutput) {
                                this.dispatchEvent(sessionId, "audioOutput", jsonResponse.event.audioOutput);
                            }
                            else if ((_e = jsonResponse.event) === null || _e === void 0 ? void 0 : _e.contentEnd) {
                                this.dispatchEvent(sessionId, "contentEnd", jsonResponse.event.contentEnd);
                            }
                            else {
                                const eventKeys = Object.keys(jsonResponse.event || {});
                                if (eventKeys.length > 0) {
                                    this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
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
                    this.dispatchEvent(sessionId, "error", {
                        type: "modelStreamErrorException",
                        details: event.modelStreamErrorException,
                    });
                }
            }
            logger_1.logger.info(`Response stream processing complete for session ${sessionId}`);
        }
        catch (error) {
            logger_1.logger.error(`Error processing response stream for session ${sessionId}: `, error);
            this.dispatchEvent(sessionId, "error", {
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
        // Store the system prompt in the session
        session.systemPrompt = systemPromptContent;
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
    setupStartAudioEvent(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
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
    async streamAudioChunk(sessionId, audioData) {
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
    dispatchEvent(sessionId, eventType, data) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        const handler = session.responseHandlers.get(eventType);
        if (handler) {
            try {
                handler(data);
            }
            catch (e) {
                logger_1.logger.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
            }
        }
    }
    async closeSession(sessionId) {
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
exports.NovaSonicClient = NovaSonicClient;
