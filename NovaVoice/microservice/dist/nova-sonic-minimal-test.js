"use strict";
/**
 * Minimal Nova Sonic test - let's see what it actually expects
 */
Object.defineProperty(exports, "__esModule", { value: true });
const credential_providers_1 = require("@aws-sdk/credential-providers");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
async function testMinimalNovaSonic() {
    var _a;
    console.log('=== Minimal Nova Sonic Test ===');
    const client = new client_bedrock_runtime_1.BedrockRuntimeClient({
        credentials: (0, credential_providers_1.fromNodeProviderChain)(),
        region: "us-east-1",
        requestHandler: new node_http_handler_1.NodeHttp2Handler({
            requestTimeout: 30000,
            sessionTimeout: 30000,
        }),
    });
    const sessionId = (0, node_crypto_1.randomUUID)();
    const promptName = (0, node_crypto_1.randomUUID)();
    console.log(`Session ID: ${sessionId}`);
    console.log(`Prompt Name: ${promptName}`);
    // Create the simplest possible async iterable - just sessionStart
    const asyncIterable = {
        [Symbol.asyncIterator]: () => {
            let eventSent = false;
            return {
                next: async () => {
                    if (eventSent) {
                        console.log('Iterator done');
                        return { value: undefined, done: true };
                    }
                    eventSent = true;
                    const event = {
                        event: {
                            sessionStart: {
                                inferenceConfiguration: {
                                    maxTokens: 1024,
                                    topP: 0.9,
                                    temperature: 0.7,
                                },
                            },
                        },
                    };
                    console.log('Sending sessionStart:', JSON.stringify(event, null, 2));
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
        console.log('Calling Nova Sonic...');
        const response = await client.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
            modelId: "amazon.nova-sonic-v1:0",
            body: asyncIterable,
        }));
        console.log('Stream established, reading responses...');
        // Read first few events to see what Nova Sonic expects
        let eventCount = 0;
        for await (const event of response.body) {
            eventCount++;
            console.log(`\n--- Event ${eventCount} ---`);
            if ((_a = event.chunk) === null || _a === void 0 ? void 0 : _a.bytes) {
                try {
                    const textResponse = new TextDecoder().decode(event.chunk.bytes);
                    console.log('Raw response:', textResponse);
                    try {
                        const jsonResponse = JSON.parse(textResponse);
                        console.log('Parsed response:', JSON.stringify(jsonResponse, null, 2));
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
                console.log('Model error:', event.modelStreamErrorException);
            }
            else {
                console.log('Other event type:', Object.keys(event));
            }
            if (eventCount >= 5) {
                console.log('Stopping after 5 events');
                break;
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
    }
}
testMinimalNovaSonic().catch(console.error);
