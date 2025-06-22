#!/usr/bin/env node

const { Voice } = require('@vonage/voice');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

async function makeWebhookCall() {
  console.log('📞 TESTING WEBHOOK-BASED OUTBOUND CALL');
  console.log('=====================================\n');

  try {
    const privateKey = fs.readFileSync('./vonage-private-key.pem', 'utf8');
    
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe",
      applicationId: "891be877-9a63-45e1-bdd3-f66d74f206a0",
      privateKey: privateKey
    });

    const voice = new Voice(auth);

    console.log('📞 Making call with webhook URLs...');
    
    const call = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: '+12135235735'
      },
      answer_url: ['https://gospelshare.io/outbound/webhooks/answer'],
      event_url: ['https://gospelshare.io/outbound/webhooks/events']
    };

    console.log('Call parameters:', JSON.stringify(call, null, 2));

    const result = await voice.createOutboundCall(call);
    
    console.log('\n✅ Call initiated!');
    console.log('   Call ID:', result.uuid);
    console.log('   Status:', result.status);
    console.log('\n🎯 The webhook will handle the AI conversation');
    
    return result;

  } catch (error) {
    console.log('❌ Call failed:', error.message);
    if (error.response && error.response.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

makeWebhookCall().catch(console.error);