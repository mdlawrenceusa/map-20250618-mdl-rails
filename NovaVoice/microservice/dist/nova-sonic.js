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
exports.NovaSonicService = void 0;
const events_1 = require("events");
const url_1 = require("url");
const logger_1 = require("./logger");
class NovaSonicService extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.isStreaming = false;
        this.region = config.region || process.env.AWS_REGION || 'us-east-1';
        this.modelId = config.modelId || 'amazon.nova-sonic-v1:0';
        this.systemPrompt = config.systemPrompt || this.getDefaultPrompt();
        logger_1.logger.info('NovaSonicService initialized', {
            region: this.region,
            modelId: this.modelId
        });
    }
    getDefaultPrompt() {
        return `You are Esther, Mike Lawrence Productions' scheduling assistant. 
    Your ONLY job is to schedule 15-minute web meetings between senior pastors and Mike Lawrence about our Gospel outreach program.
    Key Facts: Program is two-phase outreach (entertainment THEN Gospel presentation), 
    Format is 40-50 min Off-Broadway illusion show + 30 min separate Gospel message, 
    Track Record similar to Campus Crusade approach (~100,000 decisions).
    When asked who attends: The meeting is between your Pastor and Mike Lawrence, our founder. I'm just scheduling it for you.
    Be Brief: 1-2 sentences maximum per response. Always redirect to scheduling the meeting.
    Website: globaloutreachevent.com, Mike Lawrence Direct Number: 347-300-5533`;
    }
    async startBidirectionalStream(callId) {
        if (this.isStreaming) {
            logger_1.logger.warn('Stream already active');
            return;
        }
        try {
            this.sessionId = callId;
            this.isStreaming = true;
            // Create the request for bidirectional streaming
            const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com`;
            const path = `/model/${this.modelId}/invoke-with-bidirectional-stream`;
            logger_1.logger.info('Starting Nova Sonic bidirectional stream', {
                endpoint,
                path,
                sessionId: this.sessionId
            });
            // Initialize the HTTP/2 connection
            const url = new url_1.URL(endpoint + path);
            // Prepare the initial request with system prompt
            const initialEvent = {
                type: 'sessionStart',
                data: {
                    systemPrompt: this.systemPrompt,
                    sessionId: this.sessionId,
                    inferenceConfig: {
                        maxTokens: 1024,
                        temperature: 0.7,
                        topP: 0.9
                    }
                }
            };
            // Send initial event
            this.sendEvent(initialEvent);
            // Emit ready event
            this.emit('ready', { sessionId: this.sessionId });
        }
        catch (error) {
            logger_1.logger.error('Failed to start Nova Sonic stream', {
                error: error.message,
                stack: error.stack
            });
            this.isStreaming = false;
            throw error;
        }
    }
    async sendAudio(audioData) {
        if (!this.isStreaming) {
            logger_1.logger.warn('Cannot send audio - stream not active');
            return;
        }
        try {
            // Nova Sonic expects PCM 16-bit, 16kHz audio
            const audioEvent = {
                type: 'audioInput',
                data: {
                    audio: audioData.toString('base64')
                }
            };
            this.sendEvent(audioEvent);
        }
        catch (error) {
            logger_1.logger.error('Failed to send audio to Nova Sonic', {
                error: error.message
            });
        }
    }
    async sendEvent(event) {
        var _a;
        logger_1.logger.debug('Sending event to Nova Sonic', {
            type: event.type,
            dataSize: JSON.stringify(event.data || {}).length
        });
        // For audio input, call the real Nova Sonic API
        if (event.type === 'audioInput' && ((_a = event.data) === null || _a === void 0 ? void 0 : _a.audio)) {
            try {
                await this.callNovaSonicAPI(event.data.audio);
            }
            catch (error) {
                logger_1.logger.error('Failed to call Nova Sonic API', { error: error.message });
                this.emit('error', error);
            }
        }
    }
    async callNovaSonicAPI(audioBase64) {
        try {
            const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-bedrock-runtime')));
            const client = new BedrockRuntimeClient({
                region: this.region
            });
            const requestBody = {
                inputText: this.systemPrompt,
                inputAudio: audioBase64,
                audioConfig: {
                    format: "pcm",
                    sampleRateHertz: 16000
                },
                inferenceConfig: {
                    maxTokens: 1024,
                    temperature: 0.7,
                    topP: 0.9
                }
            };
            const command = new InvokeModelWithResponseStreamCommand({
                modelId: this.modelId,
                body: JSON.stringify(requestBody),
                contentType: 'application/json'
            });
            logger_1.logger.info('Calling real Nova Sonic API', {
                modelId: this.modelId,
                audioSize: audioBase64.length
            });
            const response = await client.send(command);
            if (response.body) {
                for await (const event of response.body) {
                    if (event.chunk) {
                        try {
                            const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                            // Handle audio output
                            if (chunkData.outputAudio) {
                                const audioBuffer = Buffer.from(chunkData.outputAudio, 'base64');
                                this.emit('audio', audioBuffer);
                                logger_1.logger.debug('Received audio from Nova Sonic', {
                                    size: audioBuffer.length
                                });
                            }
                            // Handle text output
                            if (chunkData.outputText) {
                                this.emit('transcript', chunkData.outputText);
                                logger_1.logger.info('Received text from Nova Sonic', {
                                    text: chunkData.outputText
                                });
                            }
                        }
                        catch (parseError) {
                            logger_1.logger.error('Failed to parse Nova Sonic response', {
                                error: parseError.message
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Nova Sonic API call failed', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    handleStreamEvent(event) {
        var _a, _b, _c;
        logger_1.logger.debug('Received Nova Sonic event', {
            type: event.type
        });
        switch (event.type) {
            case 'audioOutput':
                if ((_a = event.data) === null || _a === void 0 ? void 0 : _a.audio) {
                    const audioBuffer = Buffer.from(event.data.audio, 'base64');
                    this.emit('audio', audioBuffer);
                }
                break;
            case 'textOutput':
                if ((_b = event.data) === null || _b === void 0 ? void 0 : _b.text) {
                    this.emit('transcript', event.data.text);
                }
                break;
            case 'error':
                logger_1.logger.error('Nova Sonic error', event.data);
                this.emit('error', new Error(((_c = event.data) === null || _c === void 0 ? void 0 : _c.message) || 'Unknown error'));
                break;
            case 'contentEnd':
                logger_1.logger.info('Nova Sonic stream ended');
                this.emit('end');
                this.cleanup();
                break;
        }
    }
    async stopStream() {
        if (!this.isStreaming) {
            return;
        }
        try {
            const endEvent = {
                type: 'sessionEnd',
                data: {
                    sessionId: this.sessionId
                }
            };
            this.sendEvent(endEvent);
            this.cleanup();
        }
        catch (error) {
            logger_1.logger.error('Error stopping Nova Sonic stream', {
                error: error.message
            });
        }
    }
    cleanup() {
        this.isStreaming = false;
        this.sessionId = undefined;
        this.removeAllListeners();
    }
}
exports.NovaSonicService = NovaSonicService;
