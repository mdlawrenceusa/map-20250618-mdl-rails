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
exports.callLeadMap = exports.outboundCallManagerWithLead = exports.OutboundCallManagerWithLead = void 0;
const server_sdk_1 = require("@vonage/server-sdk");
const auth_1 = require("@vonage/auth");
const jwt = __importStar(require("jsonwebtoken"));
const uuid_1 = require("uuid");
// Global storage for lead data by call UUID
const callLeadMap = new Map();
exports.callLeadMap = callLeadMap;
class OutboundCallManagerWithLead {
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
     * Make an AI-powered outbound call with lead context
     */
    async makeAICallWithLead(to, lead, initialMessage, systemPrompt) {
        this.ensureConfigured();
        try {
            console.log(`Initiating AI-powered outbound call to ${to} for lead: ${lead.name} from ${lead.company}`);
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
            // Store lead data for this call
            callLeadMap.set(call.uuid, lead);
            // Create enhanced system prompt with lead context
            const enhancedPrompt = this.createEnhancedPrompt(lead, systemPrompt);
            // Store call information with lead data
            this.activeCalls.set(call.uuid, {
                uuid: call.uuid,
                to: to,
                lead: lead, // Store full lead record
                message: initialMessage || this.createPersonalizedGreeting(lead),
                systemPrompt: enhancedPrompt,
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
     * Create personalized greeting based on lead data
     */
    createPersonalizedGreeting(lead) {
        const hasCompany = lead.company && lead.company.trim() !== '';
        const hasName = lead.name && lead.name.trim() !== '';
        if (hasCompany && hasName) {
            return `Hello, this is Esther calling from Mike Lawrence Productions. May I speak with ${lead.name} at ${lead.company}?`;
        }
        else if (hasCompany) {
            return `Hello, this is Esther calling from Mike Lawrence Productions. May I speak with the senior pastor at ${lead.company}?`;
        }
        else if (hasName) {
            return `Hello, this is Esther calling from Mike Lawrence Productions. May I speak with ${lead.name}?`;
        }
        else {
            return "Hello, this is Esther calling from Mike Lawrence Productions. Could I please speak with your senior pastor or lead pastor?";
        }
    }
    /**
     * Create enhanced system prompt with lead context
     */
    createEnhancedPrompt(lead, basePrompt) {
        const leadContext = `
## Lead Information
You are calling the following lead:
- Name: ${lead.name || 'Unknown'}
- Church/Organization: ${lead.company || 'Unknown'}
- Location: ${lead.state_province || 'Unknown'}
- Phone: ${lead.phone}
- Email: ${lead.email || 'Not provided'}
- Website: ${lead.website || 'Not provided'}
- Lead Source: ${lead.lead_source || 'Unknown'}
- Current Status: ${lead.lead_status || 'New'}

Use this information to personalize the conversation:
- If you know the church name, reference it specifically
- If you know their location, you can mention regional relevance
- If they have a website, you've researched their ministry
- Maintain notes about this specific lead throughout the conversation
`;
        if (basePrompt) {
            return basePrompt + '\n\n' + leadContext;
        }
        else {
            // Load default prompt and append lead context
            const fs = require('fs');
            const path = require('path');
            try {
                const promptPath = path.join(__dirname, '../../church-outreach-prompt.txt');
                const defaultPrompt = fs.readFileSync(promptPath, 'utf8');
                return defaultPrompt + '\n\n' + leadContext;
            }
            catch (error) {
                console.error('Failed to load default prompt, using basic prompt with lead context');
                return `You are Esther, Mike Lawrence Productions' scheduling assistant.\n\n${leadContext}`;
            }
        }
    }
    /**
     * Get lead data for a call UUID
     */
    getLeadForCall(uuid) {
        return callLeadMap.get(uuid);
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
                // Log lead-specific events
                if (callInfo.lead) {
                    console.log(`Call ${event.status} for lead: ${callInfo.lead.name} from ${callInfo.lead.company}`);
                }
            }
        }
        // Log important events
        if (event.status === 'completed') {
            console.log(`Call ${event.uuid} completed. Duration: ${event.duration}s`);
            // TODO: Update lead status in Rails based on call outcome
            // This could be done by analyzing the transcript or call duration
            // Clean up lead data after some time
            setTimeout(() => {
                this.activeCalls.delete(event.uuid);
                callLeadMap.delete(event.uuid);
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
    /**
     * Get server URL for webhooks
     */
    getServerUrl() {
        // Use CloudFront domain for webhooks
        return process.env.SERVER_URL || 'https://gospelshare.io';
    }
}
exports.OutboundCallManagerWithLead = OutboundCallManagerWithLead;
// Export singleton instance and lead map for access in server.ts
exports.outboundCallManagerWithLead = new OutboundCallManagerWithLead();
