"use strict";
/**
 * Nova Sonic Telephony Integration
 * Bridges Vonage telephony with Nova Sonic bidirectional streaming
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicTelephonyBridge = void 0;
exports.getTelephonyBridge = getTelephonyBridge;
const events_1 = require("events");
const nova_sonic_bidirectional_1 = require("./nova-sonic-bidirectional");
class NovaSonicTelephonyBridge extends events_1.EventEmitter {
    constructor(novaSonicWsUrl) {
        super();
        this.sessions = new Map();
        this.novaSonicWsUrl = novaSonicWsUrl;
        this.streamFactory = new nova_sonic_bidirectional_1.NovaSonicStreamFactory({
            bargeInEnabled: true,
            vadThreshold: 0.01,
            vadDuration: 200
        });
    }
    /**
     * Start a new telephony session
     */
    async startSession(sessionId, phoneNumber) {
        console.log(`[TELEPHONY] 📞 Starting session ${sessionId} for ${phoneNumber}`);
        // Create session
        const session = {
            sessionId,
            phoneNumber,
            startTime: Date.now(),
            metrics: {
                interruptions: 0,
                totalDuration: 0,
                aiSpeakingTime: 0,
                userSpeakingTime: 0
            }
        };
        // Create bidirectional stream
        const stream = this.streamFactory.getStream(sessionId);
        session.stream = stream;
        // Set up event handlers
        this.setupStreamHandlers(session);
        // Connect to Nova Sonic
        await stream.connect(this.novaSonicWsUrl);
        // Store session
        this.sessions.set(sessionId, session);
        // Emit session started
        this.emit('sessionStarted', sessionId, phoneNumber);
    }
    /**
     * Process incoming audio from Vonage
     */
    async processIncomingAudio(sessionId, audioData) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.stream) {
            console.warn(`[TELEPHONY] Session ${sessionId} not found`);
            return;
        }
        try {
            // Stream audio to Nova Sonic with barge-in detection
            await session.stream.streamAudio(audioData);
        }
        catch (error) {
            console.error(`[TELEPHONY] Error processing audio for ${sessionId}:`, error);
            this.emit('error', sessionId, error);
        }
    }
    /**
     * Set up event handlers for the stream
     */
    setupStreamHandlers(session) {
        const stream = session.stream;
        // Handle barge-in
        stream.on('bargeIn', () => {
            console.log(`[TELEPHONY] 🚫 Barge-in detected for ${session.sessionId}`);
            session.metrics.interruptions++;
            this.emit('bargeIn', session.sessionId);
        });
        // Handle AI speaking state
        stream.on('aiSpeakingStart', () => {
            console.log(`[TELEPHONY] 🗣️ AI started speaking for ${session.sessionId}`);
            this.emit('aiSpeakingStart', session.sessionId);
        });
        stream.on('aiSpeakingEnd', () => {
            console.log(`[TELEPHONY] 🤐 AI stopped speaking for ${session.sessionId}`);
            this.emit('aiSpeakingEnd', session.sessionId);
        });
        // Handle audio output
        stream.on('audioOutput', (audioBuffer) => {
            // Convert audio if needed (24kHz to 16kHz for Vonage)
            const convertedAudio = this.convertAudioSampleRate(audioBuffer, 24000, 16000);
            this.emit('audioOutput', session.sessionId, convertedAudio);
        });
        // Handle transcripts
        stream.on('transcript', (text, isFinal) => {
            console.log(`[TELEPHONY] 📝 Transcript for ${session.sessionId}: ${text}`);
            this.emit('transcript', session.sessionId, text, isFinal);
        });
        // Handle errors
        stream.on('error', (error) => {
            console.error(`[TELEPHONY] Stream error for ${session.sessionId}:`, error);
            this.emit('streamError', session.sessionId, error);
        });
        // Handle disconnection
        stream.on('disconnected', () => {
            console.log(`[TELEPHONY] 🔌 Stream disconnected for ${session.sessionId}`);
            this.handleSessionEnd(session.sessionId);
        });
    }
    /**
     * Convert audio sample rate (simple linear interpolation)
     */
    convertAudioSampleRate(input, fromRate, toRate) {
        if (fromRate === toRate)
            return input;
        const ratio = fromRate / toRate;
        const inputSamples = new Int16Array(input.buffer, input.byteOffset, input.length / 2);
        const outputLength = Math.floor(inputSamples.length / ratio);
        const outputSamples = new Int16Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexInt = Math.floor(srcIndex);
            const fraction = srcIndex - srcIndexInt;
            if (srcIndexInt + 1 < inputSamples.length) {
                // Linear interpolation
                outputSamples[i] = Math.round(inputSamples[srcIndexInt] * (1 - fraction) +
                    inputSamples[srcIndexInt + 1] * fraction);
            }
            else {
                outputSamples[i] = inputSamples[srcIndexInt];
            }
        }
        return Buffer.from(outputSamples.buffer);
    }
    /**
     * Send control command to Nova Sonic
     */
    async sendControl(sessionId, command, params) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.stream) {
            throw new Error(`Session ${sessionId} not found`);
        }
        await session.stream.sendControl(command, params);
    }
    /**
     * End a telephony session
     */
    async endSession(sessionId) {
        console.log(`[TELEPHONY] 📞 Ending session ${sessionId}`);
        await this.handleSessionEnd(sessionId);
    }
    /**
     * Handle session end
     */
    async handleSessionEnd(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        // Calculate final metrics
        session.metrics.totalDuration = Date.now() - session.startTime;
        // Disconnect stream
        if (session.stream) {
            await session.stream.disconnect();
        }
        // Remove from factory
        this.streamFactory.removeStream(sessionId);
        // Emit session ended with metrics
        this.emit('sessionEnded', sessionId, session.metrics);
        // Remove session
        this.sessions.delete(sessionId);
    }
    /**
     * Get session info
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Get session metrics
     */
    getSessionMetrics(sessionId) {
        var _a;
        const session = this.sessions.get(sessionId);
        if (!session)
            return null;
        return {
            ...session.metrics,
            currentDuration: Date.now() - session.startTime,
            streamState: (_a = session.stream) === null || _a === void 0 ? void 0 : _a.getState()
        };
    }
    /**
     * Check if AI is currently speaking
     */
    isAISpeaking(sessionId) {
        var _a;
        const session = this.sessions.get(sessionId);
        return ((_a = session === null || session === void 0 ? void 0 : session.stream) === null || _a === void 0 ? void 0 : _a.getState().isAISpeaking) || false;
    }
    /**
     * Force stop AI speaking (for emergency barge-in)
     */
    async forceStopAI(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.stream)
            return;
        await session.stream.sendControl('stopSpeaking');
    }
}
exports.NovaSonicTelephonyBridge = NovaSonicTelephonyBridge;
/**
 * Create a singleton instance for the application
 */
let telephonyBridge = null;
function getTelephonyBridge(wsUrl) {
    if (!telephonyBridge && wsUrl) {
        telephonyBridge = new NovaSonicTelephonyBridge(wsUrl);
    }
    if (!telephonyBridge) {
        throw new Error('Telephony bridge not initialized. Provide wsUrl on first call.');
    }
    return telephonyBridge;
}
