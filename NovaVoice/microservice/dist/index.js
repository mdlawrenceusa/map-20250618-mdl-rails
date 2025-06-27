"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const vonage_1 = require("./vonage");
const bedrock_1 = require("./bedrock");
const audio_processor_1 = require("./audio-processor");
const nova_sonic_client_1 = require("./nova-sonic-client");
const credential_providers_1 = require("@aws-sdk/credential-providers");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const logger_1 = require("./logger");
const prompt_client_1 = require("./prompt-client");
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
// Load environment variables
dotenv_1.default.config();
// Validation classes
class CallRequestDTO {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CallRequestDTO.prototype, "phoneNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CallRequestDTO.prototype, "prompt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CallRequestDTO.prototype, "leadId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CallRequestDTO.prototype, "campaignId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CallRequestDTO.prototype, "novaSonicParams", void 0);
class InboundRequestDTO {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InboundRequestDTO.prototype, "callId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InboundRequestDTO.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], InboundRequestDTO.prototype, "to", void 0);
// Initialize services
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
const vonageService = new vonage_1.VonageService();
// Initialize Nova Sonic client with proper configuration
const novaSonicClient = new nova_sonic_client_1.NovaSonicBidirectionalStreamClient({
    clientConfig: {
        credentials: (0, credential_providers_1.fromNodeProviderChain)(),
        region: process.env.AWS_REGION || 'us-east-1',
    },
    inferenceConfig: {
        maxTokens: 1024,
        topP: 0.9,
        temperature: 0.7,
    },
});
const activeCalls = new Map();
const activeSessions = new Map();
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        activeCalls: activeCalls.size,
        uptime: process.uptime()
    });
});
// Test NCCO endpoint
app.get('/test-ncco', (req, res) => {
    const testCallId = 'test-call-123';
    res.json([
        {
            action: 'talk',
            text: 'Hello, this is Esther from Mike Lawrence Productions. This is a test message.',
            bargeIn: true
        },
        {
            action: 'talk',
            text: 'Unfortunately, we cannot connect to the WebSocket because SSL is not configured yet. Please try again later.',
            bargeIn: false
        }
    ]);
});
// Outbound call endpoint
app.post('/calls', async (req, res) => {
    try {
        const callRequest = (0, class_transformer_1.plainToClass)(CallRequestDTO, req.body);
        const errors = await (0, class_validator_1.validate)(callRequest);
        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Invalid request',
                details: errors.map(e => Object.values(e.constraints || {})).flat()
            });
        }
        const { phoneNumber, prompt, leadId, campaignId, novaSonicParams } = callRequest;
        const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        logger_1.logger.info('Creating outbound call', { phoneNumber, callId, leadId, campaignId });
        // Fetch prompts from Rails API if not provided
        let systemPrompt = prompt;
        if (!systemPrompt) {
            try {
                const prompts = await prompt_client_1.promptClient.getDefaultPrompts(leadId, campaignId);
                systemPrompt = prompts.system;
                logger_1.logger.info('Fetched system prompt from Rails', {
                    systemPrompt: systemPrompt.substring(0, 100) + '...'
                });
            }
            catch (error) {
                logger_1.logger.error('Failed to fetch prompts, using fallback', { error });
                systemPrompt = process.env.DEFAULT_OUTBOUND_PROMPT ||
                    'You are Esther from Mike Lawrence Productions, a scheduling assistant.';
            }
        }
        // Initialize call tracking
        const bedrock = new bedrock_1.BedrockService();
        const audioProcessor = new audio_processor_1.AudioProcessor();
        activeCalls.set(callId, {
            bedrock,
            ws: null,
            prompt: systemPrompt,
            params: novaSonicParams || {},
            phoneNumber,
            startTime: new Date(),
            transcript: [],
            leadId,
            campaignId
        });
        // Initiate Vonage call
        const callResponse = await vonageService.initiateOutboundCall(phoneNumber, callId);
        if (callResponse.error) {
            activeCalls.delete(callId);
            return res.status(500).json(callResponse);
        }
        res.status(200).json({
            ...callResponse,
            message: 'Call initiated. Audio streaming will begin when call is answered.'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in /calls endpoint', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});
// Inbound call endpoint
app.post('/inbound', async (req, res) => {
    try {
        const inboundRequest = (0, class_transformer_1.plainToClass)(InboundRequestDTO, req.body);
        const errors = await (0, class_validator_1.validate)(inboundRequest);
        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Invalid request',
                details: errors.map(e => Object.values(e.constraints || {})).flat()
            });
        }
        const { callId, from, to } = inboundRequest;
        logger_1.logger.info('Handling inbound call', { callId, from, to });
        // Initialize call tracking with default prompt for inbound
        const bedrock = new bedrock_1.BedrockService();
        const audioProcessor = new audio_processor_1.AudioProcessor();
        const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program.
    Keep responses brief (under 25 words) and always redirect to scheduling.`;
        activeCalls.set(callId, {
            bedrock,
            ws: null,
            prompt,
            params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
            phoneNumber: from,
            startTime: new Date(),
            transcript: []
        });
        const response = await vonageService.handleInboundCall(callId, from, to);
        res.status(200).json(response);
    }
    catch (error) {
        logger_1.logger.error('Error in /inbound endpoint', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});
// Vonage webhook endpoints
app.post('/vonage/outbound/answer', async (req, res) => {
    logger_1.logger.info('Vonage outbound answer webhook', { body: req.body });
    const callId = req.body.uuid;
    const call = activeCalls.get(callId);
    if (!call) {
        return res.json([{ action: 'talk', text: 'Call configuration error.' }]);
    }
    // Return NCCO for WebSocket connection
    res.json([
        {
            action: 'connect',
            endpoint: [{
                    type: 'websocket',
                    uri: `wss://${process.env.WEBHOOK_BASE_URL || req.hostname}/ws/${callId}`,
                    'content-type': 'audio/l16;rate=16000'
                }]
        }
    ]);
});
// Vonage webhook endpoints that match the configured URLs
// IMPORTANT: Answer webhook uses GET method, not POST!
app.get('/webhooks/answer', async (req, res) => {
    // Parameters come as query string, not JSON body
    const { uuid: callId, from, to, conversation_uuid } = req.query;
    logger_1.logger.info('Vonage inbound answer webhook', {
        query: req.query,
        callId,
        from,
        to,
        conversation_uuid
    });
    // Create call tracking if not exists
    if (!activeCalls.has(callId)) {
        const bedrock = new bedrock_1.BedrockService();
        const audioProcessor = new audio_processor_1.AudioProcessor();
        const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther from Mike Lawrence Productions.`;
        activeCalls.set(callId, {
            bedrock,
            ws: null,
            prompt,
            params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
            phoneNumber: from,
            startTime: new Date(),
            transcript: []
        });
    }
    // Return NCCO with initial greeting and WebSocket connection (like working PoC)
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://gospelshare.io';
    res.json([
        {
            action: 'talk',
            text: 'Hello, this is Esther from Mike Lawrence Productions. How can I help you today?'
        },
        {
            action: 'connect',
            from: 'Esther - Mike Lawrence Productions',
            endpoint: [{
                    type: 'websocket',
                    uri: `wss://${webhookBaseUrl.replace('https://', '')}/socket?channel=${callId}`,
                    'content-type': 'audio/l16;rate=16000'
                }]
        }
    ]);
});
// IMPORTANT: Answer webhook uses GET method, not POST!
app.get('/outbound/webhooks/answer', async (req, res) => {
    // Parameters come as query string, not JSON body
    const { uuid: callId, from, to, conversation_uuid } = req.query;
    logger_1.logger.info('Vonage outbound answer webhook', {
        query: req.query,
        callId,
        from,
        to,
        conversation_uuid
    });
    // Create call tracking if not exists
    if (!activeCalls.has(callId)) {
        const bedrock = new bedrock_1.BedrockService();
        const audioProcessor = new audio_processor_1.AudioProcessor();
        const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther from Mike Lawrence Productions.`;
        activeCalls.set(callId, {
            bedrock,
            ws: null,
            prompt,
            params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
            phoneNumber: to, // For outbound, 'to' is the target number
            startTime: new Date(),
            transcript: []
        });
    }
    // Return NCCO for outbound WebSocket connection (like working PoC)
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://gospelshare.io';
    res.json([
        {
            action: 'talk',
            text: 'Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?'
        },
        {
            action: 'connect',
            from: 'Esther - Mike Lawrence Productions',
            endpoint: [{
                    type: 'websocket',
                    uri: `wss://${webhookBaseUrl.replace('https://', '')}/socket?channel=${callId}`,
                    'content-type': 'audio/l16;rate=16000'
                }]
        }
    ]);
});
// Keep the old endpoint for compatibility
app.post('/vonage/inbound/answer', async (req, res) => {
    logger_1.logger.info('Vonage inbound answer webhook', { body: req.body });
    const { uuid: callId, from, to } = req.body;
    // Create call tracking if not exists
    if (!activeCalls.has(callId)) {
        const bedrock = new bedrock_1.BedrockService();
        const audioProcessor = new audio_processor_1.AudioProcessor();
        const prompt = process.env.DEFAULT_INBOUND_PROMPT || `You are Esther from Mike Lawrence Productions.`;
        activeCalls.set(callId, {
            bedrock,
            ws: null,
            prompt,
            params: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
            phoneNumber: from,
            startTime: new Date(),
            transcript: []
        });
    }
    // Return NCCO
    res.json([
        {
            action: 'talk',
            text: 'Hello, this is Esther from Mike Lawrence Productions.',
            bargeIn: true
        },
        {
            action: 'connect',
            endpoint: [{
                    type: 'websocket',
                    uri: `wss://${process.env.WEBHOOK_BASE_URL || req.hostname}/ws/${callId}`,
                    'content-type': 'audio/l16;rate=16000'
                }]
        }
    ]);
});
// Recording webhook endpoint
app.post('/webhooks/recording', (req, res) => {
    logger_1.logger.info('Vonage recording webhook', { body: req.body });
    const { recording_url, uuid: callId, duration } = req.body;
    const call = activeCalls.get(callId);
    if (call) {
        call.transcript.push(`Recording received: ${recording_url} (${duration}s)`);
    }
    res.status(200).send('OK');
});
// Vonage events endpoints that match the configured URLs
app.post('/webhooks/events', (req, res) => {
    logger_1.logger.info('Vonage inbound event', { body: req.body });
    const { uuid: callId, status } = req.body;
    if (status === 'completed' || status === 'failed') {
        const call = activeCalls.get(callId);
        if (call) {
            logger_1.logger.info('Inbound call ended', {
                callId,
                status,
                phoneNumber: call.phoneNumber,
                duration: Date.now() - call.startTime.getTime(),
                transcript: call.transcript
            });
            // TODO: Store transcript in DynamoDB and JSON log
            activeCalls.delete(callId);
        }
    }
    res.status(200).send('OK');
});
app.post('/outbound/webhooks/events', (req, res) => {
    logger_1.logger.info('Vonage outbound event', { body: req.body });
    const { uuid: callId, status } = req.body;
    if (status === 'completed' || status === 'failed') {
        const call = activeCalls.get(callId);
        if (call) {
            logger_1.logger.info('Outbound call ended', {
                callId,
                status,
                phoneNumber: call.phoneNumber,
                duration: Date.now() - call.startTime.getTime(),
                transcript: call.transcript
            });
            // TODO: Store transcript in DynamoDB and JSON log
            activeCalls.delete(callId);
        }
    }
    res.status(200).send('OK');
});
// Keep the old endpoint for compatibility
app.post('/vonage/:type/events', (req, res) => {
    const eventType = req.params.type;
    logger_1.logger.info(`Vonage ${eventType} event`, { body: req.body });
    const { uuid: callId, status } = req.body;
    if (status === 'completed' || status === 'failed') {
        const call = activeCalls.get(callId);
        if (call) {
            logger_1.logger.info('Call ended', {
                callId,
                duration: (new Date().getTime() - call.startTime.getTime()) / 1000,
                transcript: call.transcript.join(' ')
            });
            // Clean up
            activeCalls.delete(callId);
        }
    }
    res.sendStatus(200);
});
// WebSocket handling - using /socket with channel parameter like working PoC
wss.on('connection', async (ws, req) => {
    // Extract channel (callId) from query parameter: /socket?channel=callId
    const url = new URL(req.url || '', 'ws://localhost');
    const callId = url.searchParams.get('channel') || url.pathname.split('/').pop();
    logger_1.logger.info('WebSocket connection attempt', {
        url: req.url,
        callId,
        pathname: url.pathname,
        searchParams: Object.fromEntries(url.searchParams),
        headers: req.headers
    });
    if (!callId || !activeCalls.has(callId)) {
        logger_1.logger.error('WebSocket connection for unknown call', { callId, url: req.url });
        ws.close();
        return;
    }
    logger_1.logger.info('WebSocket connected', { callId });
    const call = activeCalls.get(callId);
    call.ws = ws;
    try {
        logger_1.logger.info('🚀 STEP 1: Creating stream session', { callId });
        const session = novaSonicClient.createStreamSession(callId);
        activeSessions.set(callId, session);
        logger_1.logger.info('✅ STEP 1 COMPLETE: Stream session created', { callId });
        logger_1.logger.info('🎧 STEP 2: Setting up event handlers', { callId });
        // Set up event handlers matching AWS sample
        session
            .onEvent('audioOutput', (data) => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                const audioBuffer = Buffer.from(data.content, 'base64');
                ws.send(audioBuffer);
                logger_1.logger.debug('Sent audio response to caller', {
                    callId,
                    audioSize: audioBuffer.length
                });
            }
        })
            .onEvent('textOutput', (data) => {
            call.transcript.push(data.content);
            logger_1.logger.info('Nova Sonic response', { callId, text: data.content });
        })
            .onEvent('contentStart', (data) => {
            logger_1.logger.debug('Content started', { callId, data });
        })
            .onEvent('contentEnd', (data) => {
            logger_1.logger.debug('Content ended', { callId, data });
        })
            .onEvent('error', (data) => {
            logger_1.logger.error('Nova Sonic error', { callId, error: data });
        });
        logger_1.logger.info('✅ STEP 2 COMPLETE: Event handlers set', { callId });
        logger_1.logger.info('🎯 STEP 3: Setting up system prompt', { callId });
        await session.setupSystemPrompt(undefined, call.prompt);
        logger_1.logger.info('✅ STEP 3 COMPLETE: System prompt configured', {
            callId,
            promptLength: call.prompt.length,
            promptPreview: call.prompt.substring(0, 100) + '...'
        });
        logger_1.logger.info('🔗 STEP 4: Initiating Nova Sonic session (with new fast async iterator)', { callId });
        const startTime = Date.now();
        await novaSonicClient.initiateSession(callId, ws);
        const totalTime = Date.now() - startTime;
        logger_1.logger.info('🎉 COMPLETE: Nova Sonic session fully initialized', {
            callId,
            totalDuration: `${totalTime}ms`
        });
    }
    catch (error) {
        logger_1.logger.error('💥 INITIALIZATION FAILED at step', { callId, error: error.message, stack: error.stack });
        ws.close();
        return;
    }
    ws.on('message', async (data) => {
        try {
            // Log ALL WebSocket messages for debugging
            logger_1.logger.info('📨 WebSocket message received', {
                callId,
                dataType: typeof data,
                isBuffer: Buffer.isBuffer(data),
                dataLength: data.length,
                firstBytes: data.slice(0, 16).toString('hex')
            });
            // Check if this is actually audio data
            if (data.length > 100) { // Audio chunks are typically larger
                logger_1.logger.info('🎵 AUDIO RECEIVED from caller', {
                    callId,
                    audioSize: data.length,
                    firstBytes: data.slice(0, 8).toString('hex')
                });
                const session = activeSessions.get(callId);
                if (session) {
                    logger_1.logger.info('📤 SENDING AUDIO to Nova Sonic session', { callId });
                    // Send audio to Nova Sonic for processing
                    await session.streamAudio(data);
                    logger_1.logger.info('✅ AUDIO SENT to Nova Sonic', { callId, audioSize: data.length });
                }
                else {
                    logger_1.logger.error('❌ NO SESSION FOUND for audio', { callId });
                }
            }
            else {
                // Log small messages as potential control messages
                logger_1.logger.info('📝 Control message received', {
                    callId,
                    size: data.length,
                    content: data.toString('utf8')
                });
            }
        }
        catch (error) {
            logger_1.logger.error('💥 ERROR processing WebSocket message', {
                callId,
                error: error.message,
                stack: error.stack
            });
        }
    });
    ws.on('close', async () => {
        logger_1.logger.info('WebSocket disconnected', { callId });
        const call = activeCalls.get(callId);
        if (call) {
            call.ws = null;
        }
        // Clean up Nova Sonic session properly
        const session = activeSessions.get(callId);
        if (session) {
            try {
                logger_1.logger.info('🔚 Closing audio content and prompt for session', { callId });
                // End the audio content first
                await session.endAudioContent();
                logger_1.logger.debug('Audio content ended', { callId });
                // Then end the prompt 
                await session.endPrompt();
                logger_1.logger.debug('Prompt ended', { callId });
                // Finally close the session
                await session.close();
                activeSessions.delete(callId);
                logger_1.logger.info('Nova Sonic session fully closed', { callId });
            }
            catch (error) {
                logger_1.logger.error('Error closing Nova Sonic session', { callId, error: error.message });
            }
        }
    });
    ws.on('error', (error) => {
        logger_1.logger.error('WebSocket error', { callId, error: error.message });
    });
});
// Get call status endpoint
app.get('/calls/:callId', (req, res) => {
    const { callId } = req.params;
    const call = activeCalls.get(callId);
    if (!call) {
        return res.status(404).json({ error: 'Call not found' });
    }
    res.json({
        callId,
        phoneNumber: call.phoneNumber,
        startTime: call.startTime,
        duration: (new Date().getTime() - call.startTime.getTime()) / 1000,
        transcript: call.transcript.join(' '),
        status: call.ws ? 'active' : 'ended'
    });
});
// Start server
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8081;
server.listen(Number(PORT), '0.0.0.0', () => {
    logger_1.logger.info(`Microservice running on http://0.0.0.0:${PORT}`);
    logger_1.logger.info(`WebSocket server available on ws://0.0.0.0:${PORT}/ws`);
    logger_1.logger.info('Environment:', {
        webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        outboundNumber: process.env.VONAGE_OUTBOUND_NUMBER
    });
});
