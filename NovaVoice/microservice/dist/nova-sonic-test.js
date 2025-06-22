"use strict";
/**
 * Minimal Nova Sonic test to understand the protocol
 */
Object.defineProperty(exports, "__esModule", { value: true });
const credential_providers_1 = require("@aws-sdk/credential-providers");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const node_http_handler_1 = require("@smithy/node-http-handler");
const node_crypto_1 = require("node:crypto");
async function testNovaSonic() {
    console.log('Testing Nova Sonic minimal implementation...');
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
    // Create a simple async iterable that just sends sessionStart
    const asyncIterable = {
        [Symbol.asyncIterator]: () => ({
            next: async () => {
                console.log('Sending sessionStart event...');
                return {
                    value: {
                        chunk: {
                            bytes: new TextEncoder().encode(JSON.stringify({
                                event: {
                                    sessionStart: {
                                        inferenceConfiguration: {
                                            maxTokens: 1024,
                                            topP: 0.9,
                                            temperature: 0.7,
                                        },
                                    },
                                },
                            })),
                        },
                    },
                    done: false,
                };
            },
        }),
    };
    try {
        const response = await client.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
            modelId: "amazon.nova-sonic-v1:0",
            body: asyncIterable,
        }));
        console.log('Stream established, processing responses...');
        // Process just the first few events
        let eventCount = 0;
        for await (const event of response.body) {
            eventCount++;
            console.log(`Event ${eventCount}:`, event);
            if (eventCount > 5) {
                console.log('Stopping after 5 events');
                break;
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
    }
}
testNovaSonic().catch(console.error);
