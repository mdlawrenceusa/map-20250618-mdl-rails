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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboundCallManager = void 0;
const server_sdk_1 = require("@vonage/server-sdk");
const auth_1 = require("@vonage/auth");
const jwt = __importStar(require("jsonwebtoken"));
const uuid_1 = require("uuid");
class OutboundCallManager {
    constructor(config) {
        this.vonage = null;
        this.config = null;
        this.activeCalls = new Map();
        if (config) {
            this.initializeWithConfig(config);
        }
        else {
            console.log('OutboundCallManager created without config - call configure() to set credentials');
        }
    }
    initializeWithConfig(config) {
        this.config = config;
        // Initialize Vonage client with Auth
        let auth;
        if (config.applicationId && config.privateKey) {
            // Use JWT authentication with Application ID
            console.log('Using JWT authentication with Application ID');
            // Create custom JWT with correct claims
            const now = Math.round(Date.now() / 1000);
            const payload = {
                iss: config.apiKey, // API Key as issuer
                sub: config.apiKey, // API Key as subject  
                iat: now, // Issued at
                exp: now + 900, // Expires in 15 minutes
                jti: (0, uuid_1.v4)(), // JWT ID
                application_id: config.applicationId // Application ID
            };
            const customJWT = jwt.sign(payload, config.privateKey, { algorithm: 'RS256' });
            console.log('Generated custom JWT with iss claim');
            auth = new auth_1.Auth({
                apiKey: config.apiKey,
                apiSecret: config.apiSecret,
                applicationId: config.applicationId,
                privateKey: config.privateKey
            });
            // Override the JWT generation method
            auth.createJWT = () => customJWT;
        }
        else {
            // Use basic API Key + Secret authentication
            console.log('Using basic API Key + Secret authentication');
            auth = new auth_1.Auth({
                apiKey: config.apiKey,
                apiSecret: config.apiSecret
            });
        }
        this.vonage = new server_sdk_1.Vonage(auth);
        console.log('OutboundCallManager initialized with config');
    }
    configure(config) {
        this.initializeWithConfig(config);
    }
    ensureConfigured() {
        if (!this.vonage || !this.config) {
            throw new Error('OutboundCallManager not configured. Call configure() with credentials first.');
        }
    }
    isConfigured() {
        return !!(this.vonage && this.config);
    }
    /**
     * Make a basic outbound call with simple TTS
     */
    async makeSimpleCall(to, message = "Hello, this is a test call from Nova Sonic.") {
        this.ensureConfigured();
        try {
            console.log(`Initiating outbound call to ${to}`);
            const call = await this.vonage.voice.createOutboundCall({
                to: [{
                        type: 'phone',
                        number: to
                    }],
                from: {
                    type: 'phone',
                    number: this.config.fromNumber || 'VONAGE'
                },
                answerUrl: [`${this.getServerUrl()}/outbound/answer`],
                eventUrl: [`${this.getServerUrl()}/outbound/events`]
            });
            // Store call information
            this.activeCalls.set(call.uuid, {
                uuid: call.uuid,
                to: to,
                message: message,
                status: 'initiated',
                timestamp: new Date(),
                useAI: false
            });
            console.log(`Call initiated successfully. UUID: ${call.uuid}`);
            return call;
        }
        catch (error) {
            console.error('Error making outbound call:', error);
            throw error;
        }
    }
    /**
     * Make an AI-powered outbound call
     */
    async makeAICall(to, initialMessage, systemPrompt) {
        this.ensureConfigured();
        try {
            console.log(`Initiating AI-powered outbound call to ${to}`);
            const call = await this.vonage.voice.createOutboundCall({
                to: [{
                        type: 'phone',
                        number: to
                    }],
                from: {
                    type: 'phone',
                    number: this.config.fromNumber || 'VONAGE'
                },
                answerUrl: [`${this.getServerUrl()}/outbound/webhooks/answer`],
                eventUrl: [`${this.getServerUrl()}/outbound/webhooks/events`]
            });
            // Store call information
            this.activeCalls.set(call.uuid, {
                uuid: call.uuid,
                to: to,
                message: initialMessage || "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?",
                systemPrompt: systemPrompt,
                status: 'initiated',
                timestamp: new Date(),
                useAI: true
            });
            console.log(`AI call initiated successfully. UUID: ${call.uuid}`);
            return call;
        }
        catch (error) {
            console.error('Error making AI outbound call:', error);
            throw error;
        }
    }
    /**
     * Handle answer webhook for simple calls
     */
    handleSimpleAnswer(req, res) {
        const callUuid = req.query.uuid;
        const callInfo = this.activeCalls.get(callUuid);
        console.log(`Handling simple answer for call ${callUuid}`);
        const ncco = [
            {
                action: 'talk',
                text: callInfo?.message || 'Hello, this is a test call from Nova Sonic.',
                voiceName: 'Amy'
            },
            {
                action: 'record',
                endOnSilence: 3,
                endOnKey: '#',
                timeOut: 10,
                beepStart: true
            },
            {
                action: 'talk',
                text: 'Thank you for your time. Goodbye!'
            }
        ];
        if (callInfo) {
            callInfo.status = 'answered';
            this.activeCalls.set(callUuid, callInfo);
        }
        res.json(ncco);
    }
    /**
     * Handle answer webhook for AI calls
     */
    handleAIAnswer(req, res) {
        const callUuid = req.query.uuid;
        const callInfo = this.activeCalls.get(callUuid);
        console.log(`Handling AI answer for call ${callUuid}`);
        const ncco = [
            {
                action: 'talk',
                text: callInfo?.message || 'Hello, I am an AI assistant. Please wait while I connect you to our speech system.',
                voiceName: 'Amy'
            },
            {
                action: 'connect',
                from: 'AI Assistant',
                endpoint: [
                    {
                        type: 'websocket',
                        uri: `wss://${req.get('host')}/outbound/ai-websocket/${callUuid}`,
                        'content-type': 'audio/l16;rate=16000'
                    }
                ]
            }
        ];
        if (callInfo) {
            callInfo.status = 'connected_ai';
            this.activeCalls.set(callUuid, callInfo);
        }
        res.json(ncco);
    }
    /**
     * Handle call events
     */
    handleCallEvents(req, res) {
        const event = req.body;
        console.log('Call event received:', event);
        if (event.uuid && this.activeCalls.has(event.uuid)) {
            const callInfo = this.activeCalls.get(event.uuid);
            if (callInfo) {
                callInfo.status = event.status;
                callInfo.lastEvent = event;
                this.activeCalls.set(event.uuid, callInfo);
            }
        }
        // Log important events
        if (event.status === 'completed') {
            console.log(`Call ${event.uuid} completed. Duration: ${event.duration}s`);
            // Optionally remove from active calls after some time
            setTimeout(() => {
                this.activeCalls.delete(event.uuid);
            }, 60000); // Remove after 1 minute
        }
        res.status(200).send('OK');
    }
    /**
     * Get all active calls
     */
    getActiveCalls() {
        return Array.from(this.activeCalls.values());
    }
    getCallInfo(uuid) {
        return this.activeCalls.get(uuid);
    }
    handleCallEvent(event) {
        const uuid = event.uuid;
        if (this.activeCalls.has(uuid)) {
            const callInfo = this.activeCalls.get(uuid);
            if (callInfo) {
                callInfo.status = event.status;
                callInfo.lastEvent = event;
                this.activeCalls.set(uuid, callInfo);
                console.log(`Call ${uuid} status updated to: ${event.status}`);
            }
        }
    }
    /**
     * Get call information by UUID
     */
    getCall(uuid) {
        return this.activeCalls.get(uuid);
    }
    /**
     * Hangup a call
     */
    async hangupCall(uuid) {
        this.ensureConfigured();
        try {
            console.log(`Hanging up call ${uuid}`);
            const result = await this.vonage.voice.hangupCall(uuid);
            if (this.activeCalls.has(uuid)) {
                const callInfo = this.activeCalls.get(uuid);
                if (callInfo) {
                    callInfo.status = 'completed';
                    this.activeCalls.set(uuid, callInfo);
                }
            }
            return result;
        }
        catch (error) {
            console.error(`Error hanging up call ${uuid}:`, error);
            throw error;
        }
    }
    /**
     * Get server URL for webhooks
     */
    getServerUrl() {
        // Use CloudFront domain for webhooks
        return process.env.SERVER_URL || 'https://gospelshare.io';
    }
}
exports.OutboundCallManager = OutboundCallManager;
exports.default = OutboundCallManager;
