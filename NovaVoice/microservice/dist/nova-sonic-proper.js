"use strict";
/**
 * Proper Nova Sonic Bidirectional Streaming Implementation
 * Based on AWS Samples GitHub repository
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicProperClient = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const events_1 = require("events");
const crypto_1 = require("crypto");
const logger_1 = require("./logger");
class StreamSession {
    constructor(sessionId, client) {
        this.sessionId = sessionId;
        this.client = client;
    }
    onEvent(eventType, handler) {
        this.client.registerEventHandler(this.sessionId, eventType, handler);
        return this;
    }
    async setupPromptStart() {
        this.client.setupPromptStartEvent(this.sessionId);
    }
    async setupSystemPrompt(textConfig, systemPromptContent) {
        this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
    }
    async setupStartAudio(audioConfig) {
        this.client.setupStartAudioEvent(this.sessionId, audioConfig);
    }
    async streamAudio(audioData) {
        await this.client.sendAudio(this.sessionId, audioData);
    }
    async close() {
        await this.client.endSession(this.sessionId);
    }
}
class NovaSonicProperClient extends events_1.EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.modelId = 'amazon.nova-sonic-v1:0';
        this.client = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region: process.env.AWS_REGION || 'us-east-1',
            requestHandler: new node_http_handler_1.NodeHttp2Handler({
                maxConcurrentStreams: 10,
            }),
        });
        logger_1.logger.info('Nova Sonic Proper Client initialized', {
            region: process.env.AWS_REGION || 'us-east-1',
            modelId: this.modelId
        });
    }
    async startSession(sessionId, systemPrompt) {
        try {
            logger_1.logger.info('Starting Nova Sonic bidirectional stream', { sessionId });
            const promptName = (0, crypto_1.randomUUID)();
            const contentName = (0, crypto_1.randomUUID)();
            // Create session data
            const sessionData = {
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
                            contentName: (0, crypto_1.randomUUID)(),
                            type: "TEXT"
                        }
                    }
                },
                // System prompt
                {
                    event: {
                        textInput: {
                            promptName: promptName,
                            contentName: (0, crypto_1.randomUUID)(),
                            content: systemPrompt
                        }
                    }
                },
                // Content end for system prompt
                {
                    event: {
                        contentEnd: {
                            promptName: promptName,
                            contentName: (0, crypto_1.randomUUID)()
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
            const command = new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
                modelId: this.modelId,
                body: asyncIterable,
            });
            const response = await this.client.send(command);
            sessionData.stream = response;
            this.sessions.set(sessionId, sessionData);
            // Process the response stream
            this.processResponseStream(sessionId, response);
            this.emit('sessionStarted', sessionId);
            logger_1.logger.info('Nova Sonic bidirectional stream started', { sessionId });
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
    createAsyncIterable(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        return {
            [Symbol.asyncIterator]: () => {
                return {
                    next: async () => {
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
    async processResponseStream(sessionId, response) {
        var _a, _b, _c, _d;
        try {
            if (response.body) {
                for await (const event of response.body) {
                    if (event.chunk) {
                        const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                        if ((_a = chunkData.event) === null || _a === void 0 ? void 0 : _a.audioOutput) {
                            const audioData = chunkData.event.audioOutput;
                            this.dispatchEvent(sessionId, 'audioOutput', audioData);
                            logger_1.logger.debug('Received audio from Nova Sonic', {
                                sessionId,
                                audioSize: ((_b = audioData.content) === null || _b === void 0 ? void 0 : _b.length) || 0
                            });
                        }
                        if ((_c = chunkData.event) === null || _c === void 0 ? void 0 : _c.textOutput) {
                            const textData = chunkData.event.textOutput;
                            const session = this.sessions.get(sessionId);
                            if (session && textData.content) {
                                session.transcript.push(textData.content);
                            }
                            this.dispatchEvent(sessionId, 'textOutput', textData);
                            logger_1.logger.info('Received text from Nova Sonic', { sessionId, text: textData.content });
                        }
                        if ((_d = chunkData.event) === null || _d === void 0 ? void 0 : _d.contentEnd) {
                            logger_1.logger.info('Nova Sonic content end', { sessionId });
                            this.dispatchEvent(sessionId, 'contentEnd', chunkData.event.contentEnd);
                        }
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing Nova Sonic response stream', {
                sessionId,
                error: error.message
            });
            this.emit('error', sessionId, error);
        }
    }
    async sendAudio(sessionId, audioData) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isActive) {
            logger_1.logger.warn('Attempted to send audio to inactive session', { sessionId });
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
            logger_1.logger.debug('Queued audio for Nova Sonic', {
                sessionId,
                audioSize: audioData.length
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to send audio to Nova Sonic', {
                sessionId,
                error: error.message
            });
            throw error;
        }
    }
    async endSession(sessionId) {
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
            logger_1.logger.info('Nova Sonic session ended', {
                sessionId,
                duration: Date.now() - session.startTime,
                transcriptLength: session.transcript.length
            });
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
        const session = this.sessions.get(sessionId);
        return session ? session.transcript : [];
    }
    isSessionActive(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? session.isActive : false;
    }
    getActiveSessions() {
        return Array.from(this.sessions.keys()).filter(sessionId => { var _a; return (_a = this.sessions.get(sessionId)) === null || _a === void 0 ? void 0 : _a.isActive; });
    }
    // Methods to match PoC interface
    createStreamSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            throw new Error(`Stream session with ID ${sessionId} already exists`);
        }
        const sessionData = {
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
    async initiateSession(sessionId) {
        return this.startSession(sessionId, this.getDefaultSystemPrompt());
    }
    setupPromptStartEvent(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.queue.push({
            event: {
                promptStart: {
                    promptName: session.promptName
                }
            }
        });
    }
    setupSystemPromptEvent(sessionId, textConfig, systemPromptContent) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
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
    setupStartAudioEvent(sessionId, audioConfig) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
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
    registerEventHandler(sessionId, eventType, handler) {
        // Store event handlers for this session
        const session = this.sessions.get(sessionId);
        if (session) {
            if (!session.eventHandlers) {
                session.eventHandlers = new Map();
            }
            session.eventHandlers.set(eventType, handler);
        }
    }
    getDefaultSystemPrompt() {
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
    dispatchEvent(sessionId, eventType, data) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        const eventHandlers = session.eventHandlers;
        if (eventHandlers) {
            const handler = eventHandlers.get(eventType);
            if (handler) {
                try {
                    handler(data);
                }
                catch (e) {
                    logger_1.logger.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
                }
            }
        }
        // Also emit traditional events
        this.emit(eventType, sessionId, data);
    }
}
exports.NovaSonicProperClient = NovaSonicProperClient;
