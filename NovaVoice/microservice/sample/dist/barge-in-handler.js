"use strict";
/**
 * Barge-In Handler for Nova Sonic
 * Implements voice activity detection and interruption handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BargeInSessionManager = exports.BargeInHandler = void 0;
var BargeInHandler = /** @class */ (function () {
    function BargeInHandler(config) {
        if (config === void 0) { config = {
            vadThreshold: 0.01,
            silenceThreshold: 200,
            interruptionDelay: 100
        }; }
        this.config = config;
        this.isAISpeaking = false;
        this.lastUserActivity = 0;
        this.audioEnergyBuffer = [];
        this.bufferSize = 10; // Number of audio chunks to analyze
    }
    /**
     * Calculate audio energy/volume from PCM buffer
     */
    BargeInHandler.prototype.calculateAudioEnergy = function (audioBuffer) {
        var samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
        var sum = 0;
        for (var i = 0; i < samples.length; i++) {
            sum += Math.abs(samples[i]);
        }
        return sum / samples.length / 32768.0; // Normalize to 0-1
    };
    /**
     * Detect if user is speaking based on audio energy
     */
    BargeInHandler.prototype.detectVoiceActivity = function (audioBuffer) {
        var energy = this.calculateAudioEnergy(audioBuffer);
        // Add to rolling buffer
        this.audioEnergyBuffer.push(energy);
        if (this.audioEnergyBuffer.length > this.bufferSize) {
            this.audioEnergyBuffer.shift();
        }
        // Calculate average energy
        var avgEnergy = this.audioEnergyBuffer.reduce(function (a, b) { return a + b; }, 0) / this.audioEnergyBuffer.length;
        // Voice activity detected if above threshold
        var hasVoiceActivity = avgEnergy > this.config.vadThreshold;
        if (hasVoiceActivity) {
            this.lastUserActivity = Date.now();
        }
        return hasVoiceActivity;
    };
    /**
     * Check if user is interrupting AI
     */
    BargeInHandler.prototype.checkForInterruption = function (audioBuffer) {
        if (!this.isAISpeaking) {
            return false;
        }
        var hasVoiceActivity = this.detectVoiceActivity(audioBuffer);
        if (hasVoiceActivity) {
            var timeSinceLastActivity = Date.now() - this.lastUserActivity;
            // If user has been speaking for more than interruption delay, it's an interruption
            if (timeSinceLastActivity < this.config.interruptionDelay * 2) {
                console.log('🚫 BARGE-IN DETECTED - User interrupting AI');
                return true;
            }
        }
        return false;
    };
    /**
     * Set AI speaking state
     */
    BargeInHandler.prototype.setAISpeaking = function (speaking) {
        this.isAISpeaking = speaking;
        if (!speaking) {
            // Reset buffer when AI stops speaking
            this.audioEnergyBuffer = [];
        }
    };
    /**
     * Get current AI speaking state
     */
    BargeInHandler.prototype.getAISpeaking = function () {
        return this.isAISpeaking;
    };
    /**
     * Reset handler state
     */
    BargeInHandler.prototype.reset = function () {
        this.isAISpeaking = false;
        this.lastUserActivity = 0;
        this.audioEnergyBuffer = [];
    };
    return BargeInHandler;
}());
exports.BargeInHandler = BargeInHandler;
/**
 * Session-aware barge-in manager
 */
var BargeInSessionManager = /** @class */ (function () {
    function BargeInSessionManager() {
        this.sessions = new Map();
    }
    /**
     * Get or create barge-in handler for session
     */
    BargeInSessionManager.prototype.getHandler = function (sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, new BargeInHandler());
        }
        return this.sessions.get(sessionId);
    };
    /**
     * Remove handler for session
     */
    BargeInSessionManager.prototype.removeHandler = function (sessionId) {
        this.sessions.delete(sessionId);
    };
    /**
     * Check if session has active handler
     */
    BargeInSessionManager.prototype.hasHandler = function (sessionId) {
        return this.sessions.has(sessionId);
    };
    return BargeInSessionManager;
}());
exports.BargeInSessionManager = BargeInSessionManager;
