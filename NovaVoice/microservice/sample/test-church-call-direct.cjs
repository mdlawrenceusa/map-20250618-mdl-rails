#!/usr/bin/env node

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

console.log('🛐 EXECUTING LIVE CHURCH OUTREACH CALL');
console.log('=====================================\n');

async function makeChurchOutreachCall() {
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
    
    console.log('✅ Auth configured with Application ID');
    
    // Create Vonage client
    const vonage = new Vonage(auth);
    
    console.log('✅ Vonage client created');
    
    // Church outreach call configuration
    console.log('\n📞 MAKING CHURCH OUTREACH CALL WITH "ESTHER"...');
    console.log('🎯 Target: +1-347-200-5533');
    console.log('🎭 Identity: Esther from Mike Lawrence Productions');
    console.log('⛪ Mission: Gospel magic show ministry outreach');
    
    const callConfig = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: 'VONAGE'
      },
      answerUrl: ['https://webhook.site/test-church-outreach'],
      eventUrl: ['https://webhook.site/test-church-events'],
      answerMethod: 'GET',
      eventMethod: 'POST'
    };
    
    console.log('\n📋 Call Configuration:');
    console.log('   To:', callConfig.to[0].number);
    console.log('   From:', callConfig.from.number);
    console.log('   Answer URL:', callConfig.answerUrl[0]);
    console.log('   Event URL:', callConfig.eventUrl[0]);
    
    console.log('\n🚀 Initiating church outreach call...');
    
    const call = await vonage.voice.createOutboundCall(callConfig);
    
    console.log('\n🎉 CHURCH OUTREACH CALL INITIATED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════');
    console.log('📱 Call UUID:', call.uuid);
    console.log('📊 Call Status:', call.status);
    console.log('🔗 Call Direction:', call.direction);
    console.log('📞 To Number:', call.to?.number || 'Not specified');
    console.log('📞 From Number:', call.from?.number || 'Not specified');
    
    if (call.rate) {
      console.log('💰 Call Rate:', call.rate);
    }
    
    console.log('\n⛪ ESTHER IS NOW CALLING THE CHURCH!');
    console.log('🎯 Expected Call Flow:');
    console.log('   1. Phone rings at +1-347-200-5533');
    console.log('   2. When answered: "Hello, this is Esther calling from Mike Lawrence Productions"');
    console.log('   3. Request: "Could I please speak with your senior pastor or lead pastor?"');
    console.log('   4. Discuss Gospel magic show ministry and schedule meeting');
    
    console.log('\n📊 Full Call Response:');
    console.log(JSON.stringify(call, null, 2));
    
    // Monitor call for a bit
    console.log('\n⏰ Monitoring call status...');
    setTimeout(async () => {
      try {
        console.log('\n🔍 Checking call status after 30 seconds...');
        // You could add call status checking here if needed
      } catch (error) {
        console.log('Status check not available:', error.message);
      }
    }, 30000);
    
  } catch (error) {
    console.error('\n❌ CHURCH OUTREACH CALL FAILED:');
    console.error('📋 Error Details:');
    console.error('   Message:', error.message);
    
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      console.error('   Status Text:', error.response.statusText);
      
      if (error.response.data) {
        console.error('   Response Data:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    console.error('\n🔧 Troubleshooting:');
    if (error.message.includes('401')) {
      console.error('   • Authentication issue - check API credentials');
      console.error('   • Verify Application ID permissions');
      console.error('   • Confirm account has outbound calling enabled');
    }
    if (error.message.includes('403')) {
      console.error('   • Permission denied - check account balance');
      console.error('   • Verify number format and permissions');
    }
    if (error.message.includes('422')) {
      console.error('   • Invalid request - check webhook URLs');
      console.error('   • Verify phone number format');
    }
    
    console.error('\n📜 Full Error Object:');
    console.error(error);
  }
}

// Execute the church outreach call
makeChurchOutreachCall();