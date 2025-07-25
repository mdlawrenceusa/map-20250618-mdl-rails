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
const client_1 = require("./client");
const node_buffer_1 = require("node:buffer");
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const vonage_1 = require("./telephony/vonage");
const outbound_1 = require("./telephony/outbound");
const kb_mcp_integration_1 = require("../kb-mcp-integration");
const nova_sonic_telephony_1 = require("./nova-sonic-telephony");
// import { TwilioIntegration } from "./telephony/twilio";
const path = __importStar(require("path"));
const simple_transcript_logger_minimal_1 = require("./simple-transcript-logger-minimal");
// import { CognitoAuth } from "./auth/cognito";
// import cookieParser from "cookie-parser";
const app = (0, express_1.default)();
const wsInstance = (0, express_ws_1.default)(app);
// Configure middleware and static files FIRST
app.use(body_parser_1.default.json());
// app.use(cookieParser());
// Initialize Cognito Auth
// const cognitoAuth = new CognitoAuth({
//   region: process.env.AWS_REGION || "us-east-1",
//   userPoolId: process.env.COGNITO_USER_POOL_ID,
//   clientId: process.env.COGNITO_CLIENT_ID,
//   clientSecret: process.env.COGNITO_CLIENT_SECRET,
// });
// Serve static files for the analytics dashboard
// When running with ts-node, __dirname is /opt/nova-sonic/src/server/ts/src
const rootPath = path.join(__dirname, '../../../../');
const frontendPath = path.join(__dirname, '../../../frontend');
console.log('Serving static files from:', rootPath);
console.log('Frontend files from:', frontendPath);
// Serve login page before auth middleware
// app.get('/login', (req: Request, res: Response) => {
//   res.sendFile(path.join(rootPath, 'login.html'));
// });
// Auth endpoints (before middleware)
// app.post('/auth/login', async (req: Request, res: Response) => {
//   try {
//     const { email, password } = req.body;
//     
//     if (!email || !password) {
//       return res.status(400).json({ error: "Email and password are required" });
//     }
//     
//     const authResult = await cognitoAuth.authenticate(email, password);
//     
//     // Set cookie for web access
//     res.cookie('authToken', authResult.IdToken, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'strict',
//       maxAge: 3600000 // 1 hour
//     });
//     
//     res.json({
//       success: true,
//       token: authResult.IdToken,
//       redirectUrl: '/outbound/'
//     });
//   } catch (error) {
//     console.error('Login error:', error);
//     res.status(401).json({ error: "Invalid credentials" });
//   }
// });
// app.get('/auth/logout', (req: Request, res: Response) => {
//   res.clearCookie('authToken');
//   res.redirect('/login');
// });
// Apply auth middleware AFTER login routes
// app.use(cognitoAuth.authMiddleware());
// Static files and authenticated routes
app.use(express_1.default.static(rootPath));
app.use('/src/frontend', express_1.default.static(frontendPath));
// Explicit route for dashboard
app.get('/', (req, res) => {
    console.log('Dashboard request from:', req.ip);
    const indexPath = path.join(rootPath, 'index.html');
    console.log('Serving index.html from:', indexPath);
    res.sendFile(indexPath);
});
// Outbound dashboard route
app.get('/outbound/', (req, res) => {
    console.log('Outbound dashboard request from:', req.ip);
    res.sendFile(path.join(rootPath, 'outbound.html'));
});
const AWS_PROFILE_NAME = process.env.AWS_PROFILE || "";
const bedrockClient = new client_1.NovaSonicBidirectionalStreamClient({
    requestHandlerConfig: {
        maxConcurrentStreams: 10,
    },
    clientConfig: {
        region: process.env.AWS_REGION || "us-east-1",
        credentials: (0, credential_providers_1.fromEnv)(),
    },
});
// Initialize outbound call manager first
const outboundCallManager = new outbound_1.OutboundCallManager();
// Initialize telephony bridge for barge-in support (will be configured with port later)
let telephonyBridge;
// Integrations - configure AFTER static files
const useJson = true;
const vonage = new vonage_1.VonageIntegration(true);
vonage.configureRoutes(app);
// new TwilioIntegration(useTwilio).configureRoutes(app)
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
    // Add barge-in state tracking
    session.onEvent("contentStart", () => {
        vonage.setAISpeaking(session.getSessionId(), true);
        // Notify telephony bridge of AI speaking state
        const bridgeSession = telephonyBridge.getSession(session.getSessionId());
        if (bridgeSession === null || bridgeSession === void 0 ? void 0 : bridgeSession.stream) {
            bridgeSession.stream.emit('aiSpeakingStart');
        }
    });
    session.onEvent("contentEnd", () => {
        vonage.setAISpeaking(session.getSessionId(), false);
        // Notify telephony bridge of AI speaking state
        const bridgeSession = telephonyBridge.getSession(session.getSessionId());
        if (bridgeSession === null || bridgeSession === void 0 ? void 0 : bridgeSession.stream) {
            bridgeSession.stream.emit('aiSpeakingEnd');
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
                const fs = require('fs');
                const path = require('path');
                let churchPrompt = `You're Esther, Mike Lawrence Productions' outreach assistant. Your job is to make warm, professional calls to church offices to schedule brief web meetings with senior pastors about our World of Illusion Gospel magic show ministry.

You must begin each call by asking to speak with the senior pastor or lead pastor. If they're unavailable, ask for the best time to reach them and offer to schedule a callback.

Your primary objective is to book a 15-minute web meeting, NOT to sell the magic show event directly. Focus on getting the meeting scheduled.

Key conversation starter: "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?"

Always maintain a professional, respectful tone and keep responses concise and conversational for phone calls.`;
                try {
                    const promptPath = path.join(__dirname, '../../../church-outreach-prompt.txt');
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
                if (vonage.isOn) {
                    await vonage.processAudioData(msg, session);
                    // Note: User speech transcription happens in Vonage integration
                    // We'll add a hook there for transcript logging
                }
            }
            finally {
                if (useJson) {
                    const msgJson = JSON.parse(msg.toString());
                    // TODO: We shouldn't do this.
                    audioBuffer = node_buffer_1.Buffer.from(msgJson.event.audioInput.content, "base64");
                    await session.streamAudio(audioBuffer);
                }
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
                // Clean up barge-in handler
                vonage.cleanupSession(channelId);
            }
        }
        clientChannels.delete(ws);
    };
    initializeOrJoinChannel();
    ws.on("message", handleMessage);
    ws.on("close", handleClose);
});
/* SERVER LOGIC */
const port = 3001;
// Initialize telephony bridge now that we have the port
telephonyBridge = (0, nova_sonic_telephony_1.getTelephonyBridge)(`ws://localhost:${port}/nova-sonic-ws`);
const server = app.listen(port, '0.0.0.0', () => console.log(`Server listening on 0.0.0.0:${port}`));
console.log('Server running on HTTP port', port);
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
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
// Add endpoint to list active channels
app.get("/channels", (req, res) => {
    const channels = [];
    for (const [channelId, clients] of channelClients.entries()) {
        channels.push({
            id: channelId,
            clientCount: clients.size,
            active: bedrockClient.isSessionActive(channelId),
        });
    }
    res.status(200).json({ channels });
});
// Outbound calling endpoints
app.post("/call/simple", async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            res.status(400).json({
                error: "Missing required fields: 'to' and 'message'"
            });
            return;
        }
        const result = await outboundCallManager.makeSimpleCall(to, message);
        res.status(200).json({
            success: true,
            callId: result.uuid,
            status: result.status
        });
    }
    catch (error) {
        console.error("Error making simple call:", error);
        res.status(500).json({
            error: "Failed to make call",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
app.post("/call/ai", async (req, res) => {
    try {
        const { to, initialMessage, systemPrompt } = req.body;
        if (!to) {
            res.status(400).json({
                error: "Missing required field: 'to'"
            });
            return;
        }
        const result = await outboundCallManager.makeAICall(to, initialMessage, systemPrompt);
        res.status(200).json({
            success: true,
            callId: result.uuid,
            status: result.status
        });
    }
    catch (error) {
        console.error("Error making AI call:", error);
        res.status(500).json({
            error: "Failed to make AI call",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
app.get("/calls/active", (req, res) => {
    const activeCalls = outboundCallManager.getActiveCalls();
    res.status(200).json({ activeCalls });
});
// Configuration endpoint
app.post("/configure", async (req, res) => {
    try {
        const { apiKey, apiSecret, applicationId, privateKey, privateKeyPath, fromNumber } = req.body;
        if (!apiKey || !apiSecret) {
            res.status(400).json({
                error: "Missing required fields: apiKey, apiSecret"
            });
            return;
        }
        let finalPrivateKey = privateKey;
        // If privateKeyPath is provided, read the file
        if (privateKeyPath && !privateKey) {
            const fs = require('fs');
            try {
                finalPrivateKey = fs.readFileSync(privateKeyPath, 'utf8');
            }
            catch (error) {
                res.status(400).json({
                    error: "Failed to read private key file",
                    details: error instanceof Error ? error.message : String(error)
                });
                return;
            }
        }
        // Private key is only required if using Application ID
        if (applicationId && !finalPrivateKey) {
            res.status(400).json({
                error: "Private key is required when using Application ID"
            });
            return;
        }
        // Configure the outbound call manager
        outboundCallManager.configure({
            apiKey,
            apiSecret,
            applicationId,
            privateKey: finalPrivateKey,
            fromNumber
        });
        console.log('✅ Vonage credentials configured successfully');
        res.status(200).json({
            success: true,
            message: "Vonage credentials configured successfully",
            configured: true
        });
    }
    catch (error) {
        console.error("Error configuring Vonage credentials:", error);
        res.status(500).json({
            error: "Failed to configure credentials",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// Configuration status endpoint
app.get("/configure", (req, res) => {
    try {
        const isConfigured = outboundCallManager.isConfigured();
        res.status(200).json({ configured: isConfigured });
    }
    catch (error) {
        res.status(500).json({
            error: "Failed to check configuration status",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// Outbound call webhook handlers
app.get("/outbound/answer", (req, res) => {
    console.log('Outbound call answered:', req.query);
    const callUuid = req.query.uuid;
    const phoneNumber = req.query.to || req.query.from || 'unknown';
    const callInfo = outboundCallManager.getCallInfo(callUuid);
    // Initialize transcript logging for this call
    simple_transcript_logger_minimal_1.minimalTranscriptLogger.startCall(callUuid, phoneNumber);
    let ncco;
    if ((callInfo && callInfo.useAI) || !callInfo) {
        // AI-powered call (outbound AI or inbound call) - connect to WebSocket
        const greeting = (callInfo === null || callInfo === void 0 ? void 0 : callInfo.message) || "Hello, this is Esther from Mike Lawrence Productions. How may I help you today?";
        ncco = [
            {
                action: "talk",
                text: greeting
            },
            {
                action: "connect",
                from: "Esther - Nova Sonic AI",
                endpoint: [
                    {
                        type: "websocket",
                        uri: `wss://${req.hostname}/socket?channel=${callUuid}`,
                        "content-type": "audio/l16;rate=16000"
                    }
                ]
            }
        ];
    }
    else {
        // Simple TTS call (outbound non-AI only)
        ncco = [
            {
                action: "talk",
                text: callInfo.message || "Hello, this is a test call from Nova Sonic."
            }
        ];
    }
    res.status(200).json(ncco);
});
app.post("/outbound/events", (req, res) => {
    console.log('Outbound call event:', req.body);
    const event = req.body;
    if (event.uuid) {
        outboundCallManager.handleCallEvent(event);
    }
    res.status(200).send('OK');
});
// Fallback webhook handler
app.post("/webhook/fallback", (req, res) => {
    console.log('Fallback webhook called:', req.body);
    const ncco = [
        {
            action: "talk",
            text: "I'm sorry, there seems to be a technical issue. Please try calling back in a few minutes. Thank you for calling Mike Lawrence Productions."
        }
    ];
    res.status(200).json(ncco);
});
// AI-specific answer handler
app.get("/outbound/ai-answer", (req, res) => {
    console.log('AI call answered:', req.query);
    const callUuid = req.query.uuid;
    const callInfo = outboundCallManager.getCallInfo(callUuid);
    const ncco = [
        {
            action: "talk",
            text: (callInfo === null || callInfo === void 0 ? void 0 : callInfo.message) || "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?"
        },
        {
            action: "connect",
            from: "Esther - Mike Lawrence Productions",
            endpoint: [
                {
                    type: "websocket",
                    uri: `wss://${req.hostname}/socket?channel=${callUuid}`,
                    "content-type": "audio/l16;rate=16000"
                }
            ]
        }
    ];
    res.status(200).json(ncco);
});
// Setup Knowledge Base MCP routes
(0, kb_mcp_integration_1.setupKBRoutes)(app);
