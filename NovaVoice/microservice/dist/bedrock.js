"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BedrockService = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const logger_1 = require("./logger");
class BedrockService {
    constructor() {
        this.transcript = [];
        this.modelId = 'amazon.nova-sonic-v1:0';
        // Use IAM role if available, otherwise use environment variables
        const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
            : undefined;
        this.client = new client_bedrock_runtime_1.BedrockRuntimeClient({
            region: process.env.AWS_REGION || 'us-east-1',
            ...(credentials && { credentials })
        });
        logger_1.logger.info('BedrockService initialized', {
            region: process.env.AWS_REGION || 'us-east-1',
            modelId: this.modelId
        });
    }
    async processAudioStream(callId, prompt, params, audioData, onAudio, onTranscript) {
        try {
            logger_1.logger.info('Processing audio with Nova Sonic', {
                callId,
                audioSize: audioData.length,
                prompt: prompt.substring(0, 50) + '...'
            });
            // Convert audio to base64
            const audioBase64 = audioData.toString('base64');
            // Prepare the request body for Nova Sonic
            const requestBody = {
                inputText: prompt,
                inputAudio: audioBase64,
                audioConfig: {
                    format: "pcm",
                    sampleRateHertz: 16000
                },
                inferenceConfig: {
                    maxTokens: (params === null || params === void 0 ? void 0 : params.maxTokens) || 1024,
                    temperature: (params === null || params === void 0 ? void 0 : params.temperature) || 0.7,
                    topP: (params === null || params === void 0 ? void 0 : params.topP) || 0.9
                }
            };
            const command = new client_bedrock_runtime_1.InvokeModelWithResponseStreamCommand({
                modelId: this.modelId,
                body: JSON.stringify(requestBody),
                contentType: 'application/json'
            });
            const response = await this.client.send(command);
            // Process the streaming response
            if (response.body) {
                for await (const event of response.body) {
                    if (event.chunk) {
                        try {
                            const chunkData = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                            // Handle audio output
                            if (chunkData.outputAudio) {
                                const audioData = Buffer.from(chunkData.outputAudio, 'base64');
                                onAudio(audioData);
                                logger_1.logger.debug('Received audio chunk from Nova Sonic', {
                                    size: audioData.length
                                });
                            }
                            // Handle text output
                            if (chunkData.outputText) {
                                this.transcript.push(chunkData.outputText);
                                onTranscript(chunkData.outputText);
                                logger_1.logger.debug('Received text from Nova Sonic', {
                                    text: chunkData.outputText
                                });
                            }
                        }
                        catch (parseError) {
                            logger_1.logger.error('Failed to parse Nova Sonic chunk', {
                                error: parseError.message
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing audio with Nova Sonic', {
                callId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    getTranscript() {
        return this.transcript.join(' ');
    }
    clearTranscript() {
        this.transcript = [];
    }
}
exports.BedrockService = BedrockService;
