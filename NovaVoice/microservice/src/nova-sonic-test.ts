/**
 * Minimal Nova Sonic test to understand the protocol
 */

import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";

async function testNovaSonic() {
  console.log('Testing Nova Sonic minimal implementation...');
  
  const client = new BedrockRuntimeClient({
    credentials: fromNodeProviderChain(),
    region: "us-east-1",
    requestHandler: new NodeHttp2Handler({
      requestTimeout: 30000,
      sessionTimeout: 30000,
    }),
  });

  const sessionId = randomUUID();
  const promptName = randomUUID();
  
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
    const response = await client.send(
      new InvokeModelWithBidirectionalStreamCommand({
        modelId: "amazon.nova-sonic-v1:0",
        body: asyncIterable,
      })
    );

    console.log('Stream established, processing responses...');

    // Process just the first few events
    let eventCount = 0;
    for await (const event of response.body!) {
      eventCount++;
      console.log(`Event ${eventCount}:`, event);
      
      if (eventCount > 5) {
        console.log('Stopping after 5 events');
        break;
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testNovaSonic().catch(console.error);