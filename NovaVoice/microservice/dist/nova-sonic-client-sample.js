"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicBidirectionalStreamClient = exports.StreamSession = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const rxjs_2 = require("rxjs");
const consts_1 = require("./consts");
const ToolRegistry_1 = require("./tools/ToolRegistry");
class StreamSession {
    constructor(sessionId, client) {
        this.sessionId = sessionId;
        this.client = client;
        this.audioBufferQueue = [];
        this.maxQueueSize = 200; // Maximum number of audio chunks to queue
        this.isProcessingAudio = false;
        this.isActive = true;
    }
    onEvent(eventType, handler) {
        this.client.registerEventHandler(this.sessionId, eventType, handler);
        return this; // For chaining
    }
    async setupPromptStart() {
        this.client.setupPromptStartEvent(this.sessionId);
    }
    async setupSystemPrompt(textConfig = consts_1.DefaultTextConfiguration, systemPromptContent = consts_1.DefaultSystemPrompt) {
        this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
    }
    async setupStartAudio(audioConfig = consts_1.DefaultAudioInputConfiguration) {
        this.client.setupStartAudioEvent(this.sessionId, audioConfig);
    }
    async streamAudio(audioData) {
        if (this.audioBufferQueue.length >= this.maxQueueSize) {
            this.audioBufferQueue.shift();
            console.log("Audio queue full, dropping oldest chunk");
        }
        this.audioBufferQueue.push(audioData);
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
        console.log(`Session ${this.sessionId} close completed`);
    }
}
exports.StreamSession = StreamSession;
class NovaSonicBidirectionalStreamClient {
    constructor(config) {
        var _a;
        this.activeSessions = new Map();
        this.sessionLastActivity = new Map();
        this.sessionCleanupInProgress = new Set();
        this.toolRegistry = new ToolRegistry_1.ToolRegistry();
        const nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 300000,
            sessionTimeout: 300000,
            disableConcurrentStreams: false,
            maxConcurrentStreams: 20,
            ...config.requestHandlerConfig,
        });
        if (!config.clientConfig.credentials) {
            throw new Error("No credentials provided");
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
    async initiateSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Stream session ${sessionId} not found`);
        }
        try {
            this.setupSessionStartEvent(sessionId);
            const asyncIterable = this.createSessionAsyncIterable(sessionId);
            console.log(`Starting bidirectional stream for session ${sessionId}...`);
            const response = await this.bedrockRuntimeClient.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
                modelId: "amazon.nova-sonic-v1:0",
                body: asyncIterable,
            }));
            console.log(`Stream established for session ${sessionId}, processing responses...`);
            await this.processResponseStream(sessionId, response);
        }
        catch (error) {
            console.error(`Error in session ${sessionId}: `, error);
            this.dispatchEventForSession(sessionId, "error", {
                source: "bidirectionalStream",
                error,
            });
            if (session.isActive)
                this.closeSession(sessionId);
        }
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
                console.error(`Error in ${eventType} handler for session ${sessionId}: `, e);
            }
        }
        const anyHandler = session.responseHandlers.get("any");
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data });
            }
            catch (e) {
                console.error(`Error in 'any' handler for session ${sessionId}: `, e);
            }
        }
    }
    createSessionAsyncIterable(sessionId) {
        if (!this.isSessionActive(sessionId)) {
            console.log(`Cannot create async iterable: Session ${sessionId} not active`);
            return {
                [Symbol.asyncIterator]: () => ({
                    next: async () => ({ value: undefined, done: true }),
                }),
            };
        }
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Cannot create async iterable: Session ${sessionId} not found`);
        }
        let eventCount = 0;
        return {
            [Symbol.asyncIterator]: () => {
                console.log(`AsyncIterable iterator requested for session ${sessionId}`);
                return {
                    next: async () => {
                        try {
                            if (!session.isActive || !this.activeSessions.has(sessionId)) {
                                console.log(`Iterator closing for session ${sessionId}, done = true`);
                                return { value: undefined, done: true };
                            }
                            if (session.queue.length === 0) {
                                try {
                                    await Promise.race([
                                        (0, rxjs_2.firstValueFrom)(session.queueSignal.pipe((0, operators_1.take)(1))),
                                        (0, rxjs_2.firstValueFrom)(session.closeSignal.pipe((0, operators_1.take)(1))).then(() => {
                                            throw new Error("Stream closed");
                                        }),
                                    ]);
                                }
                                catch (error) {
                                    if (error instanceof Error) {
                                        if (error.message === "Stream closed" ||
                                            !session.isActive) {
                                            if (this.activeSessions.has(sessionId)) {
                                                console.log(`Session \${ sessionId } closed during wait`);
                                            }
                                            return { value: undefined, done: true };
                                        }
                                    }
                                    else {
                                        console.error(`Error on event close`, error);
                                    }
                                }
                            }
                            if (session.queue.length === 0 || !session.isActive) {
                                console.log(`Queue empty or session inactive: ${sessionId} `);
                                return { value: undefined, done: true };
                            }
                            const nextEvent = session.queue.shift();
                            eventCount++;
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
                            console.error(`Error in session ${sessionId} iterator: `, error);
                            session.isActive = false;
                            return { value: undefined, done: true };
                        }
                    },
                    return: async () => {
                        console.log(`Iterator return () called for session ${sessionId}`);
                        session.isActive = false;
                        return { value: undefined, done: true };
                    },
                    throw: async (error) => {
                        console.log(`Iterator throw () called for session ${sessionId} with error: `, error);
                        session.isActive = false;
                        throw error;
                    },
                };
            },
        };
    }
    async processToolUse(toolName, toolUseContent) {
        const tool = toolName.toLowerCase();
        try {
            return await this.toolRegistry.execute(tool, toolUseContent);
        }
        catch (error) {
            console.error(`Error executing tool ${tool}:`, error);
            throw error;
        }
    }
    async processResponseStream(sessionId, response) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        try {
            for await (const event of response.body) {
                if (!session.isActive) {
                    console.log(`Session ${sessionId} is no longer active, stopping response processing`);
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
                            else if ((_e = jsonResponse.event) === null || _e === void 0 ? void 0 : _e.toolUse) {
                                this.dispatchEvent(sessionId, "toolUse", jsonResponse.event.toolUse);
                                session.toolUseContent = jsonResponse.event.toolUse;
                                session.toolUseId = jsonResponse.event.toolUse.toolUseId;
                                session.toolName = jsonResponse.event.toolUse.toolName;
                            }
                            else if (((_f = jsonResponse.event) === null || _f === void 0 ? void 0 : _f.contentEnd) &&
                                ((_h = (_g = jsonResponse.event) === null || _g === void 0 ? void 0 : _g.contentEnd) === null || _h === void 0 ? void 0 : _h.type) === "TOOL") {
                                console.log(`Processing tool use for session ${sessionId}`);
                                this.dispatchEvent(sessionId, "toolEnd", {
                                    toolUseContent: session.toolUseContent,
                                    toolUseId: session.toolUseId,
                                    toolName: session.toolName,
                                });
                                console.log("Calling tool with content:", session.toolUseContent);
                                const toolResult = await this.processToolUse(session.toolName, session.toolUseContent);
                                this.sendToolResult(sessionId, session.toolUseId, toolResult);
                                this.dispatchEvent(sessionId, "toolResult", {
                                    toolUseId: session.toolUseId,
                                    result: toolResult,
                                });
                            }
                            else if ((_j = jsonResponse.event) === null || _j === void 0 ? void 0 : _j.contentEnd) {
                                this.dispatchEvent(sessionId, "contentEnd", jsonResponse.event.contentEnd);
                            }
                            else {
                                const eventKeys = Object.keys(jsonResponse.event || {});
                                console.log(`Event keys for session ${sessionId}: `, eventKeys);
                                console.log(`Handling other events`);
                                if (eventKeys.length > 0) {
                                    this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
                                }
                                else if (Object.keys(jsonResponse).length > 0) {
                                    this.dispatchEvent(sessionId, "unknown", jsonResponse);
                                }
                            }
                        }
                        catch (e) {
                            console.log(`Raw text response for session ${sessionId}(parse error): `, textResponse);
                        }
                    }
                    catch (e) {
                        console.error(`Error processing response chunk for session ${sessionId}: `, e);
                    }
                }
                else if (event.modelStreamErrorException) {
                    console.error(`Model stream error for session ${sessionId}: `, event.modelStreamErrorException);
                    this.dispatchEvent(sessionId, "error", {
                        type: "modelStreamErrorException",
                        details: event.modelStreamErrorException,
                    });
                }
                else if (event.internalServerException) {
                    console.error(`Internal server error for session ${sessionId}: `, event.internalServerException);
                    this.dispatchEvent(sessionId, "error", {
                        type: "internalServerException",
                        details: event.internalServerException,
                    });
                }
            }
            console.log(`Response stream processing complete for session ${sessionId}`);
            this.dispatchEvent(sessionId, "streamComplete", {
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            console.error(`Error processing response stream for session ${sessionId}: `, error);
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
        console.log(`Setting up initial events for session ${sessionId}...`);
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
        console.log(`Setting up prompt start event for session ${sessionId}...`);
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
                    audioOutputConfiguration: consts_1.DefaultAudioOutputConfiguration,
                    toolUseOutputConfiguration: {
                        mediaType: "application/json",
                    },
                    toolConfiguration: {
                        tools: this.toolRegistry.getToolSpecs()
                    },
                },
            },
        });
        session.isPromptStartSent = true;
    }
    setupSystemPromptEvent(sessionId, textConfig = consts_1.DefaultTextConfiguration, systemPromptContent = consts_1.DefaultSystemPrompt) {
        console.log(`Setting up systemPrompt events for session ${sessionId}...`);
        console.log(`[PROMPT DEBUG] System prompt content length: ${systemPromptContent.length} characters`);
        console.log(`[PROMPT DEBUG] System prompt preview: ${systemPromptContent.substring(0, 200)}...`);
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
        console.log(`[PROMPT DEBUG] Adding textInput event with system prompt to queue`);
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
    setupStartAudioEvent(sessionId, audioConfig = consts_1.DefaultAudioInputConfiguration) {
        console.log(`Setting up startAudioContent event for session ${sessionId}...`);
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        console.log(`Using audio content ID: ${session.audioContentId}`);
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
        console.log(`Initial events setup complete for session ${sessionId}`);
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
    async sendToolResult(sessionId, toolUseId, result) {
        const session = this.activeSessions.get(sessionId);
        console.log("inside tool result");
        if (!session || !session.isActive)
            return;
        console.log(`Sending tool result for session ${sessionId}, tool use ID: ${toolUseId}`);
        const contentId = (0, node_crypto_1.randomUUID)();
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentStart: {
                    promptName: session.promptName,
                    contentName: contentId,
                    interactive: false,
                    type: "TOOL",
                    role: "TOOL",
                    toolResultInputConfiguration: {
                        toolUseId: toolUseId,
                        type: "TEXT",
                        textInputConfiguration: {
                            mediaType: "text/plain",
                        },
                    },
                },
            },
        });
        const resultContent = typeof result === "string" ? result : JSON.stringify(result);
        this.addEventToSessionQueue(sessionId, {
            event: {
                toolResult: {
                    promptName: session.promptName,
                    contentName: contentId,
                    content: resultContent,
                },
            },
        });
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentEnd: {
                    promptName: session.promptName,
                    contentName: contentId,
                },
            },
        });
        console.log(`Tool result sent for session ${sessionId}`);
    }
    async sendContentEnd(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isAudioContentStartSent)
            return;
        await this.addEventToSessionQueue(sessionId, {
            event: {
                contentEnd: {
                    promptName: session.promptName,
                    contentName: session.audioContentId,
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    async sendPromptEnd(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || !session.isPromptStartSent)
            return;
        await this.addEventToSessionQueue(sessionId, {
            event: {
                promptEnd: {
                    promptName: session.promptName,
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    async sendSessionEnd(sessionId) {
        await this.addEventToSessionQueue(sessionId, {
            event: {
                sessionEnd: {},
            },
        });
        this.closeSession(sessionId);
    }
    registerEventHandler(sessionId, eventType, handler) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        session.responseHandlers.set(eventType, handler);
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
                console.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
            }
        }
        // Also dispatch to "any" handlers
        const anyHandler = session.responseHandlers.get("any");
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data });
            }
            catch (e) {
                console.error(`Error in 'any' handler for session ${sessionId}:`, e);
            }
        }
    }
    async closeSession(sessionId) {
        if (this.sessionCleanupInProgress.has(sessionId)) {
            console.log(`Session ${sessionId} is being cleaned up.`);
            return;
        }
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        console.log(`Closing session ${sessionId}`);
        this.sessionCleanupInProgress.add(sessionId);
        try {
            session.isActive = false;
            // If we are patient, we could wait for all this. Not really a point tho.
            this.sendContentEnd(sessionId);
            this.sendPromptEnd(sessionId);
            this.sendSessionEnd(sessionId);
            // This happens *sync* to force close the session.
            session.closeSignal.next();
            session.closeSignal.complete();
            this.activeSessions.delete(sessionId);
            this.sessionLastActivity.delete(sessionId);
            console.log(`Session ${sessionId} closed.`);
        }
        finally {
            this.sessionCleanupInProgress.delete(sessionId);
        }
    }
}
exports.NovaSonicBidirectionalStreamClient = NovaSonicBidirectionalStreamClient;
