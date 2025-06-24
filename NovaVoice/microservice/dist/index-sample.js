"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const express_ws_1 = __importDefault(require("express-ws"));
const credential_providers_1 = require("@aws-sdk/credential-providers");
const nova_sonic_client_sample_1 = require("./nova-sonic-client-sample");
const node_buffer_1 = require("node:buffer");
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const logger_1 = require("./logger");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const simple_transcript_logger_minimal_1 = require("./simple-transcript-logger-minimal");
const app = (0, express_1.default)();
const wsInstance = (0, express_ws_1.default)(app);
// Configure middleware
app.use(body_parser_1.default.json());
const AWS_PROFILE_NAME = process.env.AWS_PROFILE || "";
const bedrockClient = new nova_sonic_client_sample_1.NovaSonicBidirectionalStreamClient({
    requestHandlerConfig: {
        maxConcurrentStreams: 10,
    },
    clientConfig: {
        region: process.env.AWS_REGION || "us-east-1",
        credentials: (0, credential_providers_1.fromEnv)(),
    },
});
/* Periodically check for and close inactive sessions (every minute).
 * Sessions with no activity for over 5 minutes will be force closed
 */
setInterval(() => {
    console.log("Running session cleanup check");
    const now = Date.now();
    bedrockClient.getActiveSessions().forEach((sessionId) => {
        const lastActivity = bedrockClient.getLastActivityTime(sessionId);
        const fiveMinsInMs = 5 * 60 * 1000;
        if (now - lastActivity > fiveMinsInMs) {
            console.log(`Closing inactive session ${sessionId} due to inactivity.`);
            try {
                bedrockClient.closeSession(sessionId);
            }
            catch (error) {
                console.error(`Error force closing inactive session ${sessionId}:`, error);
            }
        }
    });
}, 60000);
// Track active websocket connections with their session IDs
const channelStreams = new Map(); // channelId -> Session
const channelClients = new Map(); // channelId -> Set of connected clients
const clientChannels = new Map(); // WebSocket -> channelId
wsInstance.getWss().on("connection", (ws) => {
    console.log("Websocket connection is open");
});
function setUpEventHandlersForChannel(session, channelId) {
    function handleSessionEvent(session, channelId, eventName, isError = false) {
        session.onEvent(eventName, (data) => {
            console[isError ? "error" : "debug"](eventName, data);
            // Broadcast to all clients in this channel
            const clients = channelClients.get(channelId) || new Set();
            const message = JSON.stringify({ event: { [eventName]: { ...data } } });
            clients.forEach((client) => {
                if (client.readyState === ws_1.default.OPEN) {
                    client.send(message);
                }
            });
        });
    }
    handleSessionEvent(session, channelId, "contentStart");
    handleSessionEvent(session, channelId, "textOutput");
    handleSessionEvent(session, channelId, "error", true);
    handleSessionEvent(session, channelId, "toolUse");
    handleSessionEvent(session, channelId, "toolResult");
    handleSessionEvent(session, channelId, "contentEnd");
    // Add transcript logging for textOutput events
    session.onEvent("textOutput", (data) => {
        if (data && data.content) {
            const content = typeof data.content === 'string' ? data.content : JSON.stringify(data.content);
            const role = data.role;
            // Map Nova Sonic roles to transcript speaker names
            let speaker;
            if (role === 'USER') {
                speaker = 'Human';
            }
            else if (role === 'ASSISTANT') {
                speaker = 'Assistant';
            }
            else {
                // Default to Assistant if role is unclear
                speaker = 'Assistant';
                console.log(`[TRANSCRIPT] Unknown role: ${role}, defaulting to Assistant`);
            }
            console.log(`[TRANSCRIPT] Adding ${speaker} text: ${content.substring(0, 50)}...`);
            simple_transcript_logger_minimal_1.minimalTranscriptLogger.addText(channelId, speaker, content);
        }
    });
    session.onEvent("streamComplete", () => {
        console.log("Stream completed for channel:", channelId);
        const clients = channelClients.get(channelId) || new Set();
        const message = JSON.stringify({ event: "streamComplete" });
        clients.forEach((client) => {
            if (client.readyState === ws_1.default.OPEN)
                client.send(message);
        });
    });
    session.onEvent("audioOutput", (data) => {
        // Process audio data as before
        let audioBuffer = null;
        const CHUNK_SIZE_BYTES = 640;
        const SAMPLES_PER_CHUNK = CHUNK_SIZE_BYTES / 2;
        const buffer = node_buffer_1.Buffer.from(data["content"], "base64");
        const newPcmSamples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / Int16Array.BYTES_PER_ELEMENT);
        const clients = channelClients.get(channelId) || new Set();
        const useJson = true;
        if (useJson) {
            const message = JSON.stringify({ event: { audioOutput: { ...data } } });
            clients.forEach((client) => {
                if (client.readyState === ws_1.default.OPEN)
                    client.send(message);
            });
        }
        let offset = 0;
        while (offset + SAMPLES_PER_CHUNK <= newPcmSamples.length) {
            const chunk = newPcmSamples.slice(offset, offset + SAMPLES_PER_CHUNK);
            clients === null || clients === void 0 ? void 0 : clients.forEach((client) => {
                if (client.readyState === ws_1.default.OPEN)
                    client.send(chunk);
            });
            offset += SAMPLES_PER_CHUNK;
        }
        audioBuffer =
            offset < newPcmSamples.length ? newPcmSamples.slice(offset) : null;
    });
}
wsInstance.app.ws("/socket", (ws, req) => {
    var _a;
    // Get channel from query parameters or use a default
    const channelId = ((_a = req.query.channel) === null || _a === void 0 ? void 0 : _a.toString()) || (0, uuid_1.v4)();
    console.log(`Client requesting connection to channel: ${channelId}`);
    const sendError = (message, details) => {
        ws.send(JSON.stringify({ event: "error", data: { message, details } }));
    };
    const initializeOrJoinChannel = async () => {
        try {
            let session;
            let isNewChannel = false;
            // Check if channel exists
            if (channelStreams.has(channelId)) {
                console.log(`Client joining existing channel: ${channelId}`);
                session = channelStreams.get(channelId);
            }
            else {
                // Create new session for this channel
                console.log(`Creating new channel: ${channelId}`);
                session = bedrockClient.createStreamSession(channelId);
                bedrockClient.initiateSession(channelId);
                channelStreams.set(channelId, session);
                channelClients.set(channelId, new Set());
                setUpEventHandlersForChannel(session, channelId);
                await session.setupPromptStart();
                // Load church outreach prompt as default
                let churchPrompt = `You're Esther, Mike Lawrence Productions' outreach assistant. Your job is to make warm, professional calls to church offices to schedule brief web meetings with senior pastors about our World of Illusion Gospel magic show ministry.

You must begin each call by asking to speak with the senior pastor or lead pastor. If they're unavailable, ask for the best time to reach them and offer to schedule a callback.

Your primary objective is to book a 15-minute web meeting, NOT to sell the magic show event directly. Focus on getting the meeting scheduled.

Key conversation starter: "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?"

Always maintain a professional, respectful tone and keep responses concise and conversational for phone calls.`;
                try {
                    const promptPath = path.join(__dirname, '../church-outreach-prompt.txt');
                    console.log(`[PROMPT DEBUG] Attempting to read prompt from: ${promptPath}`);
                    churchPrompt = fs.readFileSync(promptPath, 'utf8');
                    console.log(`[PROMPT DEBUG] Successfully loaded church prompt, length: ${churchPrompt.length} characters`);
                    console.log(`[PROMPT DEBUG] First 200 chars: ${churchPrompt.substring(0, 200)}...`);
                }
                catch (error) {
                    console.error('[PROMPT DEBUG] Failed to read church prompt file:', error);
                    console.log('[PROMPT DEBUG] Using hardcoded default church prompt');
                }
                console.log(`[PROMPT DEBUG] Setting system prompt for channel ${channelId}`);
                await session.setupSystemPrompt(undefined, churchPrompt);
                await session.setupStartAudio();
                isNewChannel = true;
            }
            // Add this client to the channel.
            const clients = channelClients.get(channelId);
            clients.add(ws);
            clientChannels.set(ws, channelId);
            console.log(`Channel ${channelId} has ${clients.size} connected clients`);
            // Notify client that connection is successful.
            ws.send(JSON.stringify({
                event: "sessionReady",
                message: `Connected to channel ${channelId}`,
                isNewChannel: isNewChannel,
            }));
        }
        catch (error) {
            sendError("Failed to initialize or join channel", String(error));
            ws.close();
        }
    };
    const handleMessage = async (msg) => {
        var _a;
        const channelId = clientChannels.get(ws);
        if (!channelId) {
            sendError("Channel not found", "No active channel for this connection");
            return;
        }
        const session = channelStreams.get(channelId);
        if (!session) {
            sendError("Session not found", "No active session for this channel");
            return;
        }
        try {
            let audioBuffer;
            try {
                const jsonMsg = JSON.parse(msg.toString());
                if (jsonMsg.type)
                    console.log(`[PROMPT DEBUG] Event received of type: ${jsonMsg.type} for channel ${channelId}`);
                switch (jsonMsg.type) {
                    case "promptStart":
                        await session.setupPromptStart();
                        break;
                    case "systemPrompt":
                        console.log(`[PROMPT DEBUG] WARNING: System prompt override attempt blocked for channel ${channelId}`);
                        console.log(`[PROMPT DEBUG] Attempted prompt length: ${((_a = jsonMsg.data) === null || _a === void 0 ? void 0 : _a.length) || 0} characters`);
                        // DISABLED: Frontend should not override telephony prompts
                        // await session.setupSystemPrompt(undefined, jsonMsg.data);
                        break;
                    case "audioStart":
                        await session.setupStartAudio();
                        break;
                    case "stopAudio":
                        await session.endAudioContent();
                        await session.endPrompt();
                        console.log("Session cleanup complete");
                        break;
                    default:
                        break;
                }
            }
            catch (e) {
                // This is likely raw audio data from Vonage
                await session.streamAudio(msg);
            }
        }
        catch (error) {
            sendError("Error processing message", String(error));
        }
    };
    const handleClose = async () => {
        const channelId = clientChannels.get(ws);
        if (!channelId) {
            console.log("No channel to clean up for this connection");
            return;
        }
        const clients = channelClients.get(channelId);
        if (clients) {
            clients.delete(ws);
            console.log(`Client disconnected from channel ${channelId}, ${clients.size} clients remaining`);
            // If this was the last client, clean up the channel
            if (clients.size === 0) {
                console.log(`Last client left channel ${channelId}, cleaning up resources`);
                const session = channelStreams.get(channelId);
                if (session && bedrockClient.isSessionActive(channelId)) {
                    try {
                        await Promise.race([
                            (async () => {
                                await session.endAudioContent();
                                await session.endPrompt();
                                await session.close();
                            })(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Session cleanup timeout")), 3000)),
                        ]);
                        // End transcript logging
                        await simple_transcript_logger_minimal_1.minimalTranscriptLogger.endCall(channelId);
                        console.log(`Successfully cleaned up channel: ${channelId}`);
                    }
                    catch (error) {
                        console.error(`Error cleaning up channel ${channelId}:`, error);
                        try {
                            bedrockClient.closeSession(channelId);
                            console.log(`Force closed session for channel: ${channelId}`);
                        }
                        catch (e) {
                            console.error(`Failed to force close session for channel ${channelId}:`, e);
                        }
                    }
                }
                channelStreams.delete(channelId);
                channelClients.delete(channelId);
            }
        }
        clientChannels.delete(ws);
    };
    initializeOrJoinChannel();
    ws.on("message", handleMessage);
    ws.on("close", handleClose);
});
// Vonage webhook endpoints matching the working sample
app.get('/webhooks/answer', async (req, res) => {
    const { uuid: callId, from, to, conversation_uuid } = req.query;
    logger_1.logger.info('Vonage inbound answer webhook', {
        query: req.query,
        callId,
        from,
        to,
        conversation_uuid
    });
    // Initialize transcript logging for this call
    simple_transcript_logger_minimal_1.minimalTranscriptLogger.startCall(callId, from || 'unknown');
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
// Vonage events endpoints
app.post('/webhooks/events', (req, res) => {
    logger_1.logger.info('Vonage inbound event', { body: req.body });
    const { uuid: callId, status } = req.body;
    if (status === 'completed' || status === 'failed') {
        logger_1.logger.info('Inbound call ended', {
            callId,
            status,
            phoneNumber: req.body.from,
            duration: req.body.duration,
            transcript: []
        });
    }
    res.status(200).send('OK');
});
// Health check endpoint
const port = 3000;
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
const server = app.listen(port, '0.0.0.0', () => console.log(`Sample Nova Sonic server listening on 0.0.0.0:${port}`));
console.log('Sample server running on HTTP port', port);
// Gracefully shut down.
process.on("SIGINT", async () => {
    console.log("Shutting down servers...");
    const forceExitTimer = setTimeout(() => {
        console.error("Forcing server shutdown after timeout");
        process.exit(1);
    }, 5000);
    try {
        const sessionPromises = [];
        for (const [channelId, session] of channelStreams.entries()) {
            console.log(`Closing session for channel ${channelId} during shutdown`);
            sessionPromises.push(bedrockClient.closeSession(channelId));
            const clients = channelClients.get(channelId) || new Set();
            clients.forEach((ws) => {
                if (ws.readyState === ws_1.default.OPEN)
                    ws.close();
            });
        }
        await Promise.all(sessionPromises);
        await new Promise((resolve) => server.close(resolve));
        clearTimeout(forceExitTimer);
        console.log("Servers shut down");
        process.exit(0);
    }
    catch (error) {
        console.error("Error during server shutdown:", error);
        process.exit(1);
    }
});
