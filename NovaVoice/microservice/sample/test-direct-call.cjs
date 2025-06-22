#!/usr/bin/env node

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

console.log('🚀 TESTING DIRECT VONAGE CALL');
console.log('=============================\n');

async function testDirectCall() {
  try {
    // Load credentials
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    
    console.log('✅ Private key loaded');
    
    // Configure auth
    const auth = new Auth({
      apiKey: '7f45e88f',
      apiSecret: 'zGq4BMH8HQFKzpfe',
      applicationId: 'f7fb73da-1cfb-4376-a701-b71c4672f30d',
      privateKey: privateKey
    });
    
    console.log('✅ Auth configured');
    
    // Create Vonage client
    const vonage = new Vonage(auth);
    
    console.log('✅ Vonage client created');
    
    // Test with minimal call configuration
    console.log('\n📞 Attempting to make test call...');
    
    const callConfig = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: 'VONAGE'
      },
      answerUrl: ['https://example.com/answer'],  // Temporary placeholder
      eventUrl: ['https://example.com/events']     // Temporary placeholder
    };
    
    console.log('Call config:', JSON.stringify(callConfig, null, 2));
    
    const call = await vonage.voice.createOutboundCall(callConfig);
    
    console.log('\n🎉 CALL SUCCESS!');
    console.log('Call UUID:', call.uuid);
    console.log('Call Status:', call.status);
    console.log('Full response:', JSON.stringify(call, null, 2));
    
  } catch (error) {
    console.error('\n❌ CALL FAILED:');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
      if (error.response.data) {
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    console.error('Full error object:', error);
  }
}

testDirectCall();