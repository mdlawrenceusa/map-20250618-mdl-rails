/**
 * Nova Sonic proper sequence test - based on what Nova Sonic expects
 */

import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import { randomUUID } from "node:crypto";

async function testProperSequence() {
  console.log('=== Nova Sonic Proper Sequence Test ===');
  
  const client = new BedrockRuntimeClient({
    credentials: fromNodeProviderChain(),
    region: "us-east-1",
    requestHandler: new NodeHttp2Handler({
      requestTimeout: 60000,
      sessionTimeout: 60000,
    }),
  });

  const sessionId = randomUUID();
  const promptName = randomUUID();
  const systemContentId = randomUUID();
  const audioContentId = randomUUID();
  
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

  const asyncIterable: AsyncIterable<InvokeModelWithBidirectionalStreamInput> = {
    [Symbol.asyncIterator]: () => {
      let eventIndex = 0;
      
      return {
        next: async (): Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>> => {
          if (eventIndex >= events.length) {
            console.log('All events sent, keeping connection open...');
            // Keep connection open but don't send more events
            return new Promise(() => {}); // Never resolves - keeps connection alive
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
    
    const response = await client.send(
      new InvokeModelWithBidirectionalStreamCommand({
        modelId: "amazon.nova-sonic-v1:0",
        body: asyncIterable,
      })
    );

    console.log('Stream established, reading responses...');

    // Read responses from Nova Sonic
    let eventCount = 0;
    for await (const event of response.body!) {
      eventCount++;
      console.log(`\n--- Response Event ${eventCount} ---`);
      
      if (event.chunk?.bytes) {
        try {
          const textResponse = new TextDecoder().decode(event.chunk.bytes);
          console.log('Raw response:', textResponse);
          
          try {
            const jsonResponse = JSON.parse(textResponse);
            console.log('Parsed response:', JSON.stringify(jsonResponse, null, 2));
            
            // Check for specific response types
            if (jsonResponse.event?.audioOutput) {
              console.log('🔊 AUDIO OUTPUT received!');
            }
            if (jsonResponse.event?.textOutput) {
              console.log('💬 TEXT OUTPUT:', jsonResponse.event.textOutput.content);
            }
            if (jsonResponse.event?.contentStart) {
              console.log('📝 CONTENT START:', jsonResponse.event.contentStart.type);
            }
            if (jsonResponse.event?.contentEnd) {
              console.log('✅ CONTENT END');
            }
            
          } catch (e) {
            console.log('Failed to parse as JSON');
          }
        } catch (e) {
          console.log('Failed to decode bytes');
        }
      } else if (event.modelStreamErrorException) {
        console.log('❌ Model error:', event.modelStreamErrorException);
        break;
      } else {
        console.log('Other event type:', Object.keys(event));
      }
      
      if (eventCount >= 10) {
        console.log('Stopping after 10 events to see what we get...');
        break;
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testProperSequence().catch(console.error);