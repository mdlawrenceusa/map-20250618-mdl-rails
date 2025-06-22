"use strict";
/**
 * Enhanced Nova Sonic Server with Barge-in Support
 * Based on nova_s2s_backend.py patterns for bidirectional streaming
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = __importDefault(require("ws"));
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const server_sdk_1 = require("@vonage/server-sdk");
const s3_prompt_loader_js_1 = require("./utils/s3-prompt-loader.js");
class EnhancedNovaServer {
    constructor() {
        this.sessions = new Map();
        this.churchPrompt = '';
        this.AUDIO_SAMPLE_RATE = 16000;
        this.CHUNK_SIZE_MS = 100;
        this.MAX_QUEUE_SIZE = 50;
        this.app = (0, express_1.default)();
        this.server = new http_1.Server(this.app);
        this.wss = new ws_1.default.Server({ server: this.server });
        this.bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        this.vonage = new server_sdk_1.Vonage({
            apiKey: process.env.VONAGE_API_KEY,
            apiSecret: process.env.VONAGE_API_SECRET,
            applicationId: process.env.VONAGE_APPLICATION_ID,
            privateKey: process.env.VONAGE_PRIVATE_KEY_PATH
        });
        this.setupRoutes();
        this.setupWebSocketHandlers();
        this.startAudioProcessing();
    }
    async loadPrompt() {
        try {
            const promptPath = path_1.default.join(__dirname, '../../../church-outreach-prompt.txt');
            console.log(`[PROMPT DEBUG] Attempting to load prompt...`);
            this.churchPrompt = await s3_prompt_loader_js_1.s3PromptLoader.getPromptWithFallback(promptPath);
            console.log(`[PROMPT DEBUG] Successfully loaded church prompt, length: ${this.churchPrompt.length} characters`);
            console.log(`[PROMPT DEBUG] First 200 chars: ${this.churchPrompt.substring(0, 200)}...`);
        }
        catch (error) {
            console.error('[PROMPT DEBUG] Failed to load prompt:', error.message);
            process.exit(1);
        }
    }
    setupRoutes() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.raw({ type: 'audio/l16', limit: '1mb' }));
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                activeSessions: this.sessions.size,
                timestamp: new Date().toISOString()
            });
        });
        // Vonage webhooks
        this.app.get('/webhooks/answer', (req, res) => {
            const { from } = req.query;
            console.log(`[WEBHOOK] Incoming call from: ${from}`);
            const sessionId = this.generateSessionId();
            const wsUrl = `wss://${req.get('host')}/ws/${sessionId}`;
            const ncco = [
                {
                    action: 'connect',
                    eventUrl: [`https://${req.get('host')}/webhooks/events`],
                    from: process.env.VONAGE_FROM_NUMBER,
                    endpoint: [{
                            type: 'websocket',
                            uri: wsUrl,
                            'content-type': 'audio/l16;rate=16000',
                            headers: {
                                'call-id': req.query.uuid || sessionId
                            }
                        }]
                }
            ];
            res.json(ncco);
        });
        this.app.post('/webhooks/events', (req, res) => {
            console.log('[EVENTS]', req.body);
            res.status(200).send('OK');
        });
        // Manual call initiation
        this.app.post('/call/ai', async (req, res) => {
            try {
                const { to, initialMessage } = req.body;
                const call = await this.vonage.voice.createOutboundCall({
                    to: [{ type: 'phone', number: to }],
                    from: { type: 'phone', number: process.env.VONAGE_FROM_NUMBER },
                    answer_url: [`https://${req.get('host')}/webhooks/answer`],
                    event_url: [`https://${req.get('host')}/webhooks/events`]
                });
                res.json({
                    success: true,
                    callId: call.uuid,
                    message: 'Call initiated successfully'
                });
            }
            catch (error) {
                console.error('[CALL ERROR]', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }
    setupWebSocketHandlers() {
        this.wss.on('connection', (ws, req) => {
            const urlParts = req.url?.split('/');
            const sessionId = urlParts?.[2] || this.generateSessionId();
            console.log(`[WS] New connection: ${sessionId}`);
            const session = {
                sessionId,
                callId: req.headers['call-id'] || sessionId,
                websocket: ws,
                audioQueue: [],
                isProcessing: false,
                lastActivity: Date.now(),
                speculativeContent: '',
                conversationState: 'listening'
            };
            this.sessions.set(sessionId, session);
            this.initializeBedrockStream(session);
            ws.on('message', (data) => {
                this.handleIncomingAudio(session, data);
            });
            ws.on('close', () => {
                console.log(`[WS] Connection closed: ${sessionId}`);
                this.cleanupSession(sessionId);
            });
            ws.on('error', (error) => {
                console.error(`[WS ERROR] ${sessionId}:`, error);
                this.cleanupSession(sessionId);
            });
        });
    }
    async initializeBedrockStream(session) {
        try {
            console.log(`[BEDROCK] Initializing stream for session ${session.sessionId}`);
            const modelConfig = {
                modelId: 'amazon.nova-micro-v1:0',
                conversationConfig: {
                    type: 'voice',
                    voice: {
                        audioConfig: {
                            sampleRate: this.AUDIO_SAMPLE_RATE,
                            encoding: 'pcm'
                        }
                    }
                },
                systemPrompts: [{
                        text: this.churchPrompt
                    }],
                enableSpeculativeGeneration: true,
                enableBargeIn: true
            };
            // Initialize bidirectional stream (pseudo-code for Nova Sonic stream)
            session.bedrockStream = await this.bedrockClient.startConversation(modelConfig);
            // Set up response handler
            session.bedrockStream.on('audioResponse', (audioData) => {
                this.handleAIAudioResponse(session, audioData);
            });
            session.bedrockStream.on('textResponse', (text) => {
                console.log(`[AI RESPONSE] ${session.sessionId}: ${text.substring(0, 100)}...`);
                session.speculativeContent = text;
            });
            session.bedrockStream.on('bargeInDetected', () => {
                console.log(`[BARGE-IN] Detected for session ${session.sessionId}`);
                this.handleBargeIn(session);
            });
        }
        catch (error) {
            console.error(`[BEDROCK ERROR] ${session.sessionId}:`, error);
        }
    }
    handleIncomingAudio(session, audioData) {
        const chunk = {
            data: audioData,
            timestamp: Date.now(),
            sequence: session.audioQueue.length
        };
        // Add to queue with size management
        session.audioQueue.push(chunk);
        if (session.audioQueue.length > this.MAX_QUEUE_SIZE) {
            session.audioQueue.shift(); // Remove oldest chunk
        }
        session.lastActivity = Date.now();
        // Immediately send to Bedrock for real-time processing
        this.processAudioChunk(session, chunk);
    }
    async processAudioChunk(session, chunk) {
        try {
            if (!session.bedrockStream) {
                console.warn(`[AUDIO] No Bedrock stream for session ${session.sessionId}`);
                return;
            }
            // Send audio chunk to Bedrock for continuous processing
            await session.bedrockStream.sendAudio({
                audioData: chunk.data,
                timestamp: chunk.timestamp,
                enableBargeIn: session.conversationState === 'speaking'
            });
            // Update conversation state based on audio activity
            this.updateConversationState(session, chunk);
        }
        catch (error) {
            console.error(`[AUDIO ERROR] ${session.sessionId}:`, error);
        }
    }
    updateConversationState(session, chunk) {
        const audioLevel = this.calculateAudioLevel(chunk.data);
        const now = Date.now();
        // Simple voice activity detection
        if (audioLevel > 0.1) { // Threshold for detecting speech
            if (session.conversationState === 'speaking') {
                // User interruption detected
                console.log(`[BARGE-IN] User interruption detected in session ${session.sessionId}`);
                this.handleBargeIn(session);
            }
            else {
                session.conversationState = 'listening';
            }
        }
    }
    handleBargeIn(session) {
        console.log(`[BARGE-IN] Handling interruption for session ${session.sessionId}`);
        // Stop current AI speech
        if (session.bedrockStream) {
            session.bedrockStream.stopGeneration();
        }
        // Clear any pending audio output
        session.conversationState = 'interrupted';
        // Reset speculative content
        session.speculativeContent = '';
        // Send signal to Bedrock to start listening
        if (session.bedrockStream) {
            session.bedrockStream.startListening({
                context: 'user_interrupted',
                previousContent: session.speculativeContent
            });
        }
    }
    handleAIAudioResponse(session, audioData) {
        if (session.websocket.readyState === ws_1.default.OPEN) {
            session.conversationState = 'speaking';
            session.websocket.send(audioData);
        }
    }
    calculateAudioLevel(audioData) {
        // Simple RMS calculation for audio level detection
        let sum = 0;
        for (let i = 0; i < audioData.length; i += 2) {
            const sample = audioData.readInt16LE(i);
            sum += sample * sample;
        }
        return Math.sqrt(sum / (audioData.length / 2)) / 32768;
    }
    startAudioProcessing() {
        // Background task to process audio queues asynchronously
        setInterval(() => {
            this.processAllSessions();
        }, this.CHUNK_SIZE_MS);
    }
    async processAllSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions) {
            // Clean up inactive sessions
            if (now - session.lastActivity > 300000) { // 5 minutes
                console.log(`[CLEANUP] Removing inactive session ${sessionId}`);
                this.cleanupSession(sessionId);
                continue;
            }
            // Process any queued audio chunks
            if (session.audioQueue.length > 0 && !session.isProcessing) {
                session.isProcessing = true;
                await this.processQueuedAudio(session);
                session.isProcessing = false;
            }
        }
    }
    async processQueuedAudio(session) {
        try {
            // Process chunks in batches for efficiency
            const batchSize = 5;
            const batch = session.audioQueue.splice(0, batchSize);
            if (batch.length === 0)
                return;
            // Combine audio chunks for processing
            const combinedAudio = Buffer.concat(batch.map(chunk => chunk.data));
            // Send to Bedrock for analysis
            if (session.bedrockStream) {
                await session.bedrockStream.processAudioBatch({
                    audioData: combinedAudio,
                    chunkCount: batch.length,
                    sessionContext: {
                        conversationState: session.conversationState,
                        speculativeContent: session.speculativeContent
                    }
                });
            }
        }
        catch (error) {
            console.error(`[QUEUE ERROR] ${session.sessionId}:`, error);
        }
    }
    cleanupSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            if (session.bedrockStream) {
                session.bedrockStream.close();
            }
            if (session.websocket.readyState === ws_1.default.OPEN) {
                session.websocket.close();
            }
            this.sessions.delete(sessionId);
        }
    }
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    async start(port = 3001) {
        await this.loadPrompt();
        this.server.listen(port, () => {
            console.log(`[SERVER] Enhanced Nova Sonic with barge-in listening on port ${port}`);
            console.log(`[SERVER] WebSocket endpoint: /ws/{sessionId}`);
            console.log(`[SERVER] Active sessions will be tracked and managed`);
            console.log(`[SERVER] Barge-in detection: ENABLED`);
            console.log(`[SERVER] Bidirectional streaming: ACTIVE`);
        });
    }
}
// Initialize and start server
const server = new EnhancedNovaServer();
server.start().catch(console.error);
exports.default = EnhancedNovaServer;
