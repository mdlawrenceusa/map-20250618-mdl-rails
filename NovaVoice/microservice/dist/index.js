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
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const logger_1 = require("./logger");
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
    __metadata("design:type", String)
], CallRequestDTO.prototype, "prompt", void 0);
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
const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
const vonageService = new vonage_1.VonageService();
const activeCalls = new Map();
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        activeCalls: activeCalls.size,
        uptime: process.uptime()
    });
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
        const { phoneNumber, prompt, novaSonicParams } = callRequest;
        const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        logger_1.logger.info('Creating outbound call', { phoneNumber, callId });
        // Initialize call tracking
        const bedrock = new bedrock_1.BedrockService();
        const audioProcessor = new audio_processor_1.AudioProcessor();
        activeCalls.set(callId, {
            bedrock,
            ws: null,
            prompt,
            params: novaSonicParams || {},
            phoneNumber,
            startTime: new Date(),
            transcript: []
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
                    contentType: 'audio/l16;rate=16000'
                }]
        }
    ]);
});
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
                    contentType: 'audio/l16;rate=16000'
                }]
        }
    ]);
});
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
// WebSocket handling
wss.on('connection', (ws, req) => {
    var _a;
    const urlParts = (_a = req.url) === null || _a === void 0 ? void 0 : _a.split('/');
    const callId = urlParts === null || urlParts === void 0 ? void 0 : urlParts[urlParts.length - 1];
    if (!callId || !activeCalls.has(callId)) {
        logger_1.logger.error('WebSocket connection for unknown call', { callId });
        ws.close();
        return;
    }
    logger_1.logger.info('WebSocket connected', { callId });
    const call = activeCalls.get(callId);
    call.ws = ws;
    const audioProcessor = new audio_processor_1.AudioProcessor();
    let processingAudio = false;
    ws.on('message', async (data) => {
        try {
            // Vonage sends raw audio data (L16 PCM 16kHz)
            if (!processingAudio) {
                processingAudio = true;
                audioProcessor.queueAudio(data);
                const audioChunk = audioProcessor.getQueuedAudio();
                if (audioChunk) {
                    // Process with Nova Sonic
                    await call.bedrock.processAudioStream(callId, call.prompt, call.params, audioChunk, (responseAudio) => {
                        // Send audio back through WebSocket
                        if (ws.readyState === ws_1.WebSocket.OPEN) {
                            ws.send(responseAudio);
                        }
                    }, (text) => {
                        // Store transcript
                        call.transcript.push(text);
                        logger_1.logger.debug('Transcript update', { callId, text });
                    });
                }
                processingAudio = false;
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing WebSocket audio', {
                callId,
                error: error.message
            });
            processingAudio = false;
        }
    });
    ws.on('close', () => {
        logger_1.logger.info('WebSocket disconnected', { callId });
        const call = activeCalls.get(callId);
        if (call) {
            call.ws = null;
            audioProcessor.clearQueue();
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
const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 8081;
server.listen(PORT, () => {
    logger_1.logger.info(`Microservice running on http://0.0.0.0:${PORT}`);
    logger_1.logger.info(`WebSocket server available on ws://0.0.0.0:${PORT}/ws`);
    logger_1.logger.info('Environment:', {
        webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        outboundNumber: process.env.VONAGE_OUTBOUND_NUMBER
    });
});
