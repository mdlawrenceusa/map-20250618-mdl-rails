#!/usr/bin/env node

/**
 * Test Simple Voice Call with Correct Vonage API Format
 */

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

async function testSimpleVoiceCall() {
  console.log('📞 TESTING SIMPLE VOICE CALL');
  console.log('============================\n');

  try {
    // Load private key and setup auth
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe",
      applicationId: "f7fb73da-1cfb-4376-a701-b71c4672f30d",
      privateKey: privateKey
    });

    const vonage = new Vonage(auth);

    // Test making a simple voice call
    console.log('📞 Attempting to create outbound call...');
    
    const callParams = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: 'VONAGE'  // This might need to be a verified number
      },
      answer_url: ['https://raw.githubusercontent.com/nexmo-community/ncco-examples/gh-pages/text-to-speech.json'],
      event_url: ['https://example.com/webhooks/events']
    };

    console.log('Call parameters:', JSON.stringify(callParams, null, 2));

    try {
      const result = await vonage.voice.createOutboundCall(callParams);
      console.log('✅ Call created successfully!');
      console.log('   Call ID:', result.uuid);
      console.log('   Status:', result.status);
      console.log('   Direction:', result.direction);
      
    } catch (callError) {
      console.log('❌ Call creation failed:');
      console.log('   Error:', callError.message);
      if (callError.response) {
        console.log('   Status:', callError.response.status);
        console.log('   Response:', JSON.stringify(callError.response.data, null, 2));
      }
      if (callError.body) {
        console.log('   Body:', callError.body);
      }
    }

  } catch (error) {
    console.log('❌ Setup failed:', error.message);
  }
}

testSimpleVoiceCall().catch(console.error);