/**
 * Minimal Nova Sonic test - let's see what it actually expects
 */

import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";

async function testMinimalNovaSonic() {
  console.log('=== Minimal Nova Sonic Test ===');
  
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

  // Create the simplest possible async iterable - just sessionStart
  const asyncIterable: AsyncIterable<InvokeModelWithBidirectionalStreamInput> = {
    [Symbol.asyncIterator]: () => {
      let eventSent = false;
      
      return {
        next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
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
    
    const response = await client.send(
      new InvokeModelWithBidirectionalStreamCommand({
        modelId: "amazon.nova-sonic-v1:0",
        body: asyncIterable,
      })
    );

    console.log('Stream established, reading responses...');

    // Read first few events to see what Nova Sonic expects
    let eventCount = 0;
    for await (const event of response.body!) {
      eventCount++;
      console.log(`\n--- Event ${eventCount} ---`);
      
      if (event.chunk?.bytes) {
        try {
          const textResponse = new TextDecoder().decode(event.chunk.bytes);
          console.log('Raw response:', textResponse);
          
          try {
            const jsonResponse = JSON.parse(textResponse);
            console.log('Parsed response:', JSON.stringify(jsonResponse, null, 2));
          } catch (e) {
            console.log('Failed to parse as JSON');
          }
        } catch (e) {
          console.log('Failed to decode bytes');
        }
      } else if (event.modelStreamErrorException) {
        console.log('Model error:', event.modelStreamErrorException);
      } else {
        console.log('Other event type:', Object.keys(event));
      }
      
      if (eventCount >= 5) {
        console.log('Stopping after 5 events');
        break;
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testMinimalNovaSonic().catch(console.error);