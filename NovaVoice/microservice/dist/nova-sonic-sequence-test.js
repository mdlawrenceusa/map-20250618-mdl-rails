"use strict";
/**
 * Nova Sonic proper sequence test - based on what Nova Sonic expects
 */
Object.defineProperty(exports, "__esModule", { value: true });
const credential_providers_1 = require("@aws-sdk/credential-providers");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
async function testProperSequence() {
    var _a, _b, _c, _d, _e;
    console.log('=== Nova Sonic Proper Sequence Test ===');
    const client = new client_bedrock_runtime_1.BedrockRuntimeClient({
        credentials: (0, credential_providers_1.fromNodeProviderChain)(),
        region: "us-east-1",
        requestHandler: new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 60000,
            sessionTimeout: 60000,
        }),
    });
    const sessionId = (0, node_crypto_1.randomUUID)();
    const promptName = (0, node_crypto_1.randomUUID)();
    const systemContentId = (0, node_crypto_1.randomUUID)();
    const audioContentId = (0, node_crypto_1.randomUUID)();
    console.log(`Session ID: ${sessionId}`);
    console.log(`Prompt Name: ${promptName}`);
    // Create proper event sequence
    const events = [
        // 1. Session start
        {
            event: {
                sessionStart: {
                    inferenceConfiguration: {
                        maxTokens: 1024,
                        topP: 0.9,
                        temperature: 0.7,
                    },
                },
            },
        },
        // 2. Prompt start
        {
            event: {
                promptStart: {
                    promptName: promptName,
                    textOutputConfiguration: {
                        mediaType: "text/plain",
                    },
                    audioOutputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 24000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        voiceId: "matthew",
                        encoding: "base64",
                        audioType: "SPEECH",
                    },
                },
            },
        },
        // 3. System prompt content start
        {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: systemContentId,
                    type: "TEXT",
                    interactive: true,
                    role: "SYSTEM",
                    textInputConfiguration: {
                        mediaType: "text/plain",
                    },
                },
            },
        },
        // 4. System prompt text
        {
            event: {
                textInput: {
                    promptName: promptName,
                    contentName: systemContentId,
                    content: "You are Esther, a helpful scheduling assistant. Keep responses brief.",
                },
            },
        },
        // 5. System prompt content end
        {
            event: {
                contentEnd: {
                    promptName: promptName,
                    contentName: systemContentId,
                },
            },
        },
        // 6. Audio content start
        {
            event: {
                contentStart: {
                    promptName: promptName,
                    contentName: audioContentId,
                    type: "AUDIO",
                    interactive: true,
                    role: "USER",
                    audioInputConfiguration: {
                        mediaType: "audio/lpcm",
                        sampleRateHertz: 16000,
                        sampleSizeBits: 16,
                        channelCount: 1,
                        audioType: "SPEECH",
                        encoding: "base64",
                    },
                },
            },
        },
    ];
    const asyncIterable = {
        [Symbol.asyncIterator]: () => {
            let eventIndex = 0;
            return {
                next: async () => {
                    if (eventIndex >= events.length) {
                        console.log('All events sent, keeping connection open...');
                        // Keep connection open but don't send more events
                        return new Promise(() => { }); // Never resolves - keeps connection alive
                    }
                    const event = events[eventIndex];
                    eventIndex++;
                    console.log(`Sending event ${eventIndex}:`, Object.keys(event.event)[0]);
                    console.log('Event detail:', JSON.stringify(event, null, 2));
                    return {
                        value: {
                            chunk: {
                                bytes: new TextEncoder().encode(JSON.stringify(event)),
                            },
                        },
                        done: false,
                    };
                },
            };
        },
    };
    try {
        console.log('Calling Nova Sonic with proper sequence...');
        const response = await client.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
            modelId: "amazon.nova-sonic-v1:0",
            body: asyncIterable,
        }));
        console.log('Stream established, reading responses...');
        // Read responses from Nova Sonic
        let eventCount = 0;
        for await (const event of response.body) {
            eventCount++;
            console.log(`\n--- Response Event ${eventCount} ---`);
            if ((_a = event.chunk) === null || _a === void 0 ? void 0 : _a.bytes) {
                try {
                    const textResponse = new TextDecoder().decode(event.chunk.bytes);
                    console.log('Raw response:', textResponse);
                    try {
                        const jsonResponse = JSON.parse(textResponse);
                        console.log('Parsed response:', JSON.stringify(jsonResponse, null, 2));
                        // Check for specific response types
                        if ((_b = jsonResponse.event) === null || _b === void 0 ? void 0 : _b.audioOutput) {
                            console.log('🔊 AUDIO OUTPUT received!');
                        }
                        if ((_c = jsonResponse.event) === null || _c === void 0 ? void 0 : _c.textOutput) {
                            console.log('💬 TEXT OUTPUT:', jsonResponse.event.textOutput.content);
                        }
                        if ((_d = jsonResponse.event) === null || _d === void 0 ? void 0 : _d.contentStart) {
                            console.log('📝 CONTENT START:', jsonResponse.event.contentStart.type);
                        }
                        if ((_e = jsonResponse.event) === null || _e === void 0 ? void 0 : _e.contentEnd) {
                            console.log('✅ CONTENT END');
                        }
                    }
                    catch (e) {
                        console.log('Failed to parse as JSON');
                    }
                }
                catch (e) {
                    console.log('Failed to decode bytes');
                }
            }
            else if (event.modelStreamErrorException) {
                console.log('❌ Model error:', event.modelStreamErrorException);
                break;
            }
            else {
                console.log('Other event type:', Object.keys(event));
            }
            if (eventCount >= 10) {
                console.log('Stopping after 10 events to see what we get...');
                break;
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
    }
}
testProperSequence().catch(console.error);
