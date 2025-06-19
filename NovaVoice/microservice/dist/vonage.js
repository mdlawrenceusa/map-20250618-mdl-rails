"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VonageService = void 0;
const server_sdk_1 = require("@vonage/server-sdk");
const auth_1 = require("@vonage/auth");
const logger_1 = require("./logger");
const fs_1 = __importDefault(require("fs"));
class VonageService {
    constructor() {
        this.webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://gospelshare.io';
        this.outboundNumber = process.env.VONAGE_OUTBOUND_NUMBER || '';
        // Read the shared private key
        const privateKey = process.env.VONAGE_OUTBOUND_PRIVATE_KEY_PATH
            ? fs_1.default.readFileSync(process.env.VONAGE_OUTBOUND_PRIVATE_KEY_PATH, 'utf8')
            : '';
        // Initialize outbound Vonage client
        this.vonageOutbound = new server_sdk_1.Vonage(new auth_1.Auth({
            apiKey: process.env.VONAGE_API_KEY,
            apiSecret: process.env.VONAGE_API_SECRET,
            applicationId: process.env.VONAGE_OUTBOUND_APPLICATION_ID,
            privateKey: privateKey
        }));
        // Initialize inbound Vonage client (same credentials, different app ID)
        this.vonageInbound = new server_sdk_1.Vonage(new auth_1.Auth({
            apiKey: process.env.VONAGE_API_KEY,
            apiSecret: process.env.VONAGE_API_SECRET,
            applicationId: process.env.VONAGE_INBOUND_APPLICATION_ID,
            privateKey: privateKey
        }));
        logger_1.logger.info('VonageService initialized', {
            outboundNumber: this.outboundNumber,
            webhookBaseUrl: this.webhookBaseUrl
        });
    }
    async initiateOutboundCall(phoneNumber, callId) {
        try {
            logger_1.logger.info('Initiating outbound call', { phoneNumber, callId });
            const ncco = [
                {
                    action: 'talk',
                    text: 'Connecting you now.',
                    language: 'en-US',
                    bargeIn: false
                },
                {
                    action: 'connect',
                    endpoint: [
                        {
                            type: 'websocket',
                            uri: `wss://${this.webhookBaseUrl}/ws/${callId}`,
                            contentType: 'audio/l16;rate=16000',
                            headers: {}
                        }
                    ]
                }
            ];
            const response = await this.vonageOutbound.voice.createOutboundCall({
                to: [{ type: 'phone', number: phoneNumber }],
                from: { type: 'phone', number: this.outboundNumber },
                ncco,
                eventUrl: [`${this.webhookBaseUrl}/outbound/webhooks/events`],
                answerUrl: [`${this.webhookBaseUrl}/outbound/webhooks/answer`]
            });
            logger_1.logger.info('Outbound call initiated', {
                callId: response.uuid,
                status: response.status
            });
            return {
                phoneNumber,
                callStatus: response.status || 'started',
                callId: response.uuid,
                transcript: ''
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to initiate outbound call', { error: error.message });
            return {
                phoneNumber,
                callStatus: 'failed',
                callId: '',
                transcript: '',
                error: `Failed to initiate Vonage call: ${error.message}`
            };
        }
    }
    async handleInboundCall(callId, from, to) {
        logger_1.logger.info('Handling inbound call', { callId, from, to });
        const ncco = [
            {
                action: 'talk',
                text: 'Hello, I am Esther from Mike Lawrence Productions. How may I help you today?',
                language: 'en-US',
                bargeIn: true
            },
            {
                action: 'connect',
                endpoint: [
                    {
                        type: 'websocket',
                        uri: `wss://${this.webhookBaseUrl}/ws/${callId}`,
                        contentType: 'audio/l16;rate=16000',
                        headers: {}
                    }
                ]
            }
        ];
        return { ncco };
    }
    async streamAudioToCall(callId, audioUrl) {
        try {
            logger_1.logger.info('Streaming audio to call', { callId, audioUrl });
            // Try outbound first, then inbound
            try {
                await this.vonageOutbound.voice.streamAudio(callId, audioUrl);
            }
            catch (error) {
                // If outbound fails, try inbound
                await this.vonageInbound.voice.streamAudio(callId, audioUrl);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to stream audio to call', {
                callId,
                error: error.message
            });
        }
    }
    async endCall(callId) {
        try {
            logger_1.logger.info('Ending call', { callId });
            // Try to end call using both clients
            try {
                await this.vonageOutbound.voice.hangupCall(callId);
            }
            catch (error) {
                await this.vonageInbound.voice.hangupCall(callId);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to end call', {
                callId,
                error: error.message
            });
        }
    }
}
exports.VonageService = VonageService;
