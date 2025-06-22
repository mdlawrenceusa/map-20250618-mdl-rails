#!/usr/bin/env node

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

console.log('📞 TESTING WITH LINKED PHONE NUMBER');
console.log('==================================\n');

async function testLinkedNumberCall() {
  try {
    // Load credentials
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    
    console.log('✅ Private key loaded');
    console.log('📱 Using linked phone number: +1-213-523-5700');
    console.log('🎯 Target number: +1-347-200-5533');
    
    // Configure auth with Application ID
    const auth = new Auth({
      apiKey: '7f45e88f',
      apiSecret: 'zGq4BMH8HQFKzpfe',
      applicationId: 'f7fb73da-1cfb-4376-a701-b71c4672f30d',
      privateKey: privateKey
    });
    
    console.log('✅ Auth configured with Application ID');
    
    // Create Vonage client
    const vonage = new Vonage(auth);
    
    console.log('✅ Vonage client created');
    
    // Test call configuration with linked number
    console.log('\n🚀 MAKING TEST CALL...');
    
    const callConfig = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: '+12135235700'  // Using the linked number
      },
      answerUrl: ['https://webhook.site/test-linked-number'],
      eventUrl: ['https://webhook.site/test-events'],
      answerMethod: 'GET',
      eventMethod: 'POST'
    };
    
    console.log('📋 Call Configuration:');
    console.log('   From (Linked):', callConfig.from.number);
    console.log('   To (Target):', callConfig.to[0].number);
    console.log('   Answer URL:', callConfig.answerUrl[0]);
    
    const call = await vonage.voice.createOutboundCall(callConfig);
    
    console.log('\n🎉 CALL SUCCESS WITH LINKED NUMBER!');
    console.log('═════════════════════════════════════');
    console.log('📱 Call UUID:', call.uuid);
    console.log('📊 Status:', call.status);
    console.log('📞 From:', call.from?.number || 'Not specified');
    console.log('📞 To:', call.to?.number || 'Not specified');
    console.log('💰 Rate:', call.rate || 'Not specified');
    
    console.log('\n🔔 PHONE SHOULD BE RINGING NOW!');
    console.log('📱 Caller ID should show: +1-213-523-5700');
    console.log('🎯 Target phone: +1-347-200-5533');
    
    console.log('\n📊 Full Response:');
    console.log(JSON.stringify(call, null, 2));
    
  } catch (error) {
    console.error('\n❌ CALL FAILED:');
    console.error('Message:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Status Text:', error.response.statusText);
    }
    
    if (error.message.includes('401')) {
      console.error('\n🔧 401 Error Analysis:');
      console.error('   • Account may need outbound calling enabled');
      console.error('   • Phone number may need activation period');
      console.error('   • Application permissions may need verification');
      console.error('   • Balance verification: €9.07 should be sufficient');
    }
    
    console.error('\nFull error:', error);
  }
}

testLinkedNumberCall();