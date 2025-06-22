"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VonageIntegration = void 0;
const node_buffer_1 = require("node:buffer");
const barge_in_handler_1 = require("../barge-in-handler");
class VonageIntegration {
    constructor(isOn = false) {
        this.bargeInHandlers = new Map();
        this.isOn = isOn;
        if (this.isOn)
            console.log("Vonage integration initialized with barge-in support.");
    }
    configureRoutes(app) {
        if (!this.isOn)
            return;
        app.get("/webhooks/answer", this.handleWebhookAnswer.bind(this));
        app.post("/webhooks/events", this.handleWebhookEvents.bind(this));
        // Add outbound webhook routes to match Vonage configuration
        app.get("/outbound/webhooks/answer", this.handleWebhookAnswer.bind(this));
        app.post("/outbound/webhooks/events", this.handleWebhookEvents.bind(this));
    }
    handleWebhookAnswer(req, res) {
        // Get call details
        const direction = req.query.direction;
        const from = req.query.from;
        const to = req.query.to;
        console.log(`[WEBHOOK] Handling ${direction} call from ${from} to ${to}`);
        // Determine greeting based on call direction
        let greeting;
        let fromName;
        if (direction === 'outbound') {
            // Outbound call - use Esther's greeting
            greeting = "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?";
            fromName = "Esther - Mike Lawrence Productions";
        }
        else {
            // Inbound call - generic greeting
            greeting = "Hello, welcome to our automated assistant. How can I help you today?";
            fromName = "Vonage";
        }
        // Always use secure WebSocket through CloudFront
        const protocol = 'wss';
        const host = 'gospelshare.io';
        const nccoResponse = [
            {
                action: "talk",
                text: greeting,
            },
            {
                action: "connect",
                from: fromName,
                endpoint: [
                    {
                        type: "websocket",
                        uri: `${protocol}://${host}/socket`,
                        "content-type": "audio/l16;rate=16000",
                    },
                ],
            },
        ];
        console.log(`[WEBHOOK] Responding with WebSocket URI: ${protocol}://${host}/socket`);
        res.status(200).json(nccoResponse);
    }
    handleWebhookEvents(req, res) {
        console.log("Vonage event received:", req.body);
        res.sendStatus(200);
    }
    async processAudioData(message, session) {
        if (!this.isOn)
            return;
        try {
            const audioBuffer = node_buffer_1.Buffer.from(message);
            const sessionId = session.getSessionId();
            // Get or create barge-in handler for this session
            if (!this.bargeInHandlers.has(sessionId)) {
                this.bargeInHandlers.set(sessionId, new barge_in_handler_1.BargeInHandler());
                console.log(`[BARGE-IN] 🎯 Created barge-in handler for session ${sessionId}`);
            }
            const handler = this.bargeInHandlers.get(sessionId);
            // Check for interruption
            if (handler.checkForInterruption(audioBuffer)) {
                console.log(`[BARGE-IN] 🚫 INTERRUPTION DETECTED in session ${sessionId}!`);
                // Stop current audio output by ending content
                try {
                    await session.endAudioContent();
                    console.log(`[BARGE-IN] ✅ Stopped AI audio for session ${sessionId}`);
                    // Restart audio input
                    await session.setupStartAudio();
                    console.log(`[BARGE-IN] ✅ Restarted audio input for session ${sessionId}`);
                }
                catch (error) {
                    console.error(`[BARGE-IN] ❌ Error handling interruption:`, error);
                }
            }
            // Continue with normal audio processing
            await session.streamAudio(audioBuffer);
        }
        catch (error) {
            console.error("Error processing Vonage audio data:", error);
        }
    }
    // Set AI speaking state for barge-in detection
    setAISpeaking(sessionId, speaking) {
        const handler = this.bargeInHandlers.get(sessionId);
        if (handler) {
            handler.setAISpeaking(speaking);
            console.log(`[BARGE-IN] 🎤 AI speaking state for ${sessionId}: ${speaking}`);
        }
    }
    // Clean up barge-in handler when session ends
    cleanupSession(sessionId) {
        if (this.bargeInHandlers.has(sessionId)) {
            this.bargeInHandlers.delete(sessionId);
            console.log(`[BARGE-IN] 🧹 Cleaned up barge-in handler for session ${sessionId}`);
        }
    }
}
exports.VonageIntegration = VonageIntegration;
