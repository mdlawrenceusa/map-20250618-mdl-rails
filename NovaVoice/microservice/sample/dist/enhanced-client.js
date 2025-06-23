"use strict";
/**
 * Enhanced Nova Sonic Client with Barge-In Support
 * Extends the base client to add interruption handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedNovaSonicClient = exports.EnhancedStreamSession = void 0;
const client_1 = require("./client");
const barge_in_handler_1 = require("./barge-in-handler");
const node_buffer_1 = require("node:buffer");
class EnhancedStreamSession extends client_1.StreamSession {
    constructor(sessionId, client, bargeInManager) {
        super(sessionId, client);
        this.bargeInManager = bargeInManager;
        this.isInterrupted = false;
    }
    /**
     * Override streamAudio to add interruption detection
     */
    async streamAudio(audioData) {
        console.log(`[BARGE-IN DEBUG] Enhanced streamAudio called for session ${this.getSessionId()}`);
        const handler = this.bargeInManager.getHandler(this.getSessionId());
        // Check for interruption
        if (handler.checkForInterruption(audioData)) {
            console.log(`[BARGE-IN] 🚫 INTERRUPTION DETECTED! Handling...`);
            await this.handleInterruption();
        }
        // Continue with normal audio streaming
        return super.streamAudio(audioData);
    }
    /**
     * Handle interruption event
     */
    async handleInterruption() {
        if (this.isInterrupted)
            return;
        this.isInterrupted = true;
        console.log(`🚫 Handling interruption for session ${this.getSessionId()}`);
        // Notify callback if set
        if (this.onInterruptCallback) {
            this.onInterruptCallback();
        }
        // Send interruption event to Nova Sonic
        await this.sendInterruptionSignal();
        // Clear AI output
        this.client.clearAudioOutput(this.getSessionId());
    }
    /**
     * Send interruption signal to Nova Sonic
     */
    async sendInterruptionSignal() {
        try {
            // Send a special event to interrupt AI generation
            await this.client.sendEvent(this.getSessionId(), {
                event: {
                    type: 'systemPrompt',
                    content: 'The user has interrupted. Please stop speaking immediately and listen.'
                }
            });
            // End current content
            await this.endAudioContent();
            // Restart audio for new user input
            await this.setupStartAudio();
        }
        catch (error) {
            console.error('Error sending interruption signal:', error);
        }
    }
    /**
     * Set callback for interruption events
     */
    onInterruption(callback) {
        this.onInterruptCallback = callback;
    }
    /**
     * Reset interruption state
     */
    resetInterruption() {
        this.isInterrupted = false;
        const handler = this.bargeInManager.getHandler(this.getSessionId());
        handler.reset();
    }
}
exports.EnhancedStreamSession = EnhancedStreamSession;
class EnhancedNovaSonicClient extends client_1.NovaSonicBidirectionalStreamClient {
    constructor(config) {
        super(config);
        this.bargeInManager = new barge_in_handler_1.BargeInSessionManager();
        this.audioOutputBuffers = new Map();
        console.log(`[BARGE-IN] 🚀 EnhancedNovaSonicClient initialized`);
    }
    /**
     * Override createStreamSession to return enhanced session
     */
    createStreamSession(sessionId) {
        console.log(`[BARGE-IN] 🔧 Creating enhanced stream session...`);
        const baseSession = super.createStreamSession(sessionId);
        const enhancedSession = new EnhancedStreamSession(baseSession.getSessionId(), this, this.bargeInManager);
        console.log(`[BARGE-IN] ✅ Enhanced session created: ${enhancedSession.getSessionId()}`);
        // Set up event handlers for AI speaking state
        enhancedSession.onEvent('contentStart', () => {
            const handler = this.bargeInManager.getHandler(enhancedSession.getSessionId());
            handler.setAISpeaking(true);
            console.log(`🎤 AI started speaking for session ${enhancedSession.getSessionId()}`);
        });
        enhancedSession.onEvent('contentEnd', () => {
            const handler = this.bargeInManager.getHandler(enhancedSession.getSessionId());
            handler.setAISpeaking(false);
            console.log(`🔇 AI stopped speaking for session ${enhancedSession.getSessionId()}`);
        });
        // Handle audio output to track what's being sent
        enhancedSession.onEvent('audioOutput', (data) => {
            this.bufferAudioOutput(enhancedSession.getSessionId(), data.content);
        });
        // Set up interruption callback
        enhancedSession.onInterruption(() => {
            console.log(`🚫 Session ${enhancedSession.getSessionId()} interrupted by user`);
            this.clearAudioOutput(enhancedSession.getSessionId());
        });
        return enhancedSession;
    }
    /**
     * Buffer audio output for potential clearing
     */
    bufferAudioOutput(sessionId, audioContent) {
        if (!this.audioOutputBuffers.has(sessionId)) {
            this.audioOutputBuffers.set(sessionId, []);
        }
        const buffer = node_buffer_1.Buffer.from(audioContent, 'base64');
        const buffers = this.audioOutputBuffers.get(sessionId);
        buffers.push(buffer);
        // Keep only last 10 chunks
        if (buffers.length > 10) {
            buffers.shift();
        }
    }
    /**
     * Clear audio output buffer when interrupted
     */
    clearAudioOutput(sessionId) {
        this.audioOutputBuffers.delete(sessionId);
        // Dispatch clear event to frontend
        this.dispatchEventToClients(sessionId, 'clearAudio', {
            reason: 'interruption'
        });
    }
    /**
     * Send custom event to session
     */
    async sendEvent(sessionId, event) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        session.queue.push(event);
    }
    /**
     * Clean up session
     */
    async closeSession(sessionId) {
        this.bargeInManager.removeHandler(sessionId);
        this.audioOutputBuffers.delete(sessionId);
        return super.closeSession(sessionId);
    }
    /**
     * Dispatch event helper
     */
    dispatchEventToClients(sessionId, eventType, data) {
        // Use internal method to dispatch events
        this.dispatchEventForSession?.(sessionId, eventType, data);
    }
}
exports.EnhancedNovaSonicClient = EnhancedNovaSonicClient;
