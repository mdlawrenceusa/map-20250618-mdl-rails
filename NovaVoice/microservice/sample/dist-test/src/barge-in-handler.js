"use strict";
/**
 * Barge-In Handler for Nova Sonic
 * Implements voice activity detection and interruption handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BargeInSessionManager = exports.BargeInHandler = void 0;
class BargeInHandler {
    constructor(config = {
        vadThreshold: 0.01,
        silenceThreshold: 200,
        interruptionDelay: 100
    }) {
        this.config = config;
        this.isAISpeaking = false;
        this.lastUserActivity = 0;
        this.audioEnergyBuffer = [];
        this.bufferSize = 10; // Number of audio chunks to analyze
    }
    /**
     * Calculate audio energy/volume from PCM buffer
     */
    calculateAudioEnergy(audioBuffer) {
        const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += Math.abs(samples[i]);
        }
        return sum / samples.length / 32768.0; // Normalize to 0-1
    }
    /**
     * Detect if user is speaking based on audio energy
     */
    detectVoiceActivity(audioBuffer) {
        const energy = this.calculateAudioEnergy(audioBuffer);
        // Add to rolling buffer
        this.audioEnergyBuffer.push(energy);
        if (this.audioEnergyBuffer.length > this.bufferSize) {
            this.audioEnergyBuffer.shift();
        }
        // Calculate average energy
        const avgEnergy = this.audioEnergyBuffer.reduce((a, b) => a + b, 0) / this.audioEnergyBuffer.length;
        // Voice activity detected if above threshold
        const hasVoiceActivity = avgEnergy > this.config.vadThreshold;
        if (hasVoiceActivity) {
            this.lastUserActivity = Date.now();
        }
        return hasVoiceActivity;
    }
    /**
     * Check if user is interrupting AI
     */
    checkForInterruption(audioBuffer) {
        if (!this.isAISpeaking) {
            return false;
        }
        const hasVoiceActivity = this.detectVoiceActivity(audioBuffer);
        if (hasVoiceActivity) {
            const timeSinceLastActivity = Date.now() - this.lastUserActivity;
            // If user has been speaking for more than interruption delay, it's an interruption
            if (timeSinceLastActivity < this.config.interruptionDelay * 2) {
                console.log('🚫 BARGE-IN DETECTED - User interrupting AI');
                return true;
            }
        }
        return false;
    }
    /**
     * Set AI speaking state
     */
    setAISpeaking(speaking) {
        this.isAISpeaking = speaking;
        if (!speaking) {
            // Reset buffer when AI stops speaking
            this.audioEnergyBuffer = [];
        }
    }
    /**
     * Get current AI speaking state
     */
    getAISpeaking() {
        return this.isAISpeaking;
    }
    /**
     * Reset handler state
     */
    reset() {
        this.isAISpeaking = false;
        this.lastUserActivity = 0;
        this.audioEnergyBuffer = [];
    }
}
exports.BargeInHandler = BargeInHandler;
/**
 * Session-aware barge-in manager
 */
class BargeInSessionManager {
    constructor() {
        this.sessions = new Map();
    }
    /**
     * Get or create barge-in handler for session
     */
    getHandler(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, new BargeInHandler());
        }
        return this.sessions.get(sessionId);
    }
    /**
     * Remove handler for session
     */
    removeHandler(sessionId) {
        this.sessions.delete(sessionId);
    }
    /**
     * Check if session has active handler
     */
    hasHandler(sessionId) {
        return this.sessions.has(sessionId);
    }
}
exports.BargeInSessionManager = BargeInSessionManager;
