#!/usr/bin/env node

/**
 * Debug Vonage Application Details
 */

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

async function debugVonageApp() {
  console.log('🔍 DEBUGGING VONAGE APPLICATION');
  console.log('===============================\n');

  try {
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe",
      applicationId: "f7fb73da-1cfb-4376-a701-b71c4672f30d",
      privateKey: privateKey
    });

    const vonage = new Vonage(auth);

    // Check application details
    console.log('📋 Checking application details...');
    try {
      const app = await vonage.applications.getApplication("f7fb73da-1cfb-4376-a701-b71c4672f30d");
      console.log('✅ Application found:');
      console.log('   Name:', app.name);
      console.log('   ID:', app.id);
      console.log('   Capabilities:', Object.keys(app.capabilities || {}));
      
      // Check voice capabilities specifically
      if (app.capabilities && app.capabilities.voice) {
        console.log('   Voice webhook URLs:');
        console.log('     Answer URL:', app.capabilities.voice.answer_url?.address);
        console.log('     Event URL:', app.capabilities.voice.event_url?.address);
      } else {
        console.log('⚠️  Voice capability not found - this might be the issue!');
      }
      
    } catch (appError) {
      console.log('❌ Could not get application details:');
      console.log('   Error:', appError.message);
    }

    // Try to check account balance
    console.log('\n💰 Checking account balance...');
    try {
      const balance = await vonage.account.getBalance();
      console.log('✅ Account balance:', balance.value, balance.currency);
    } catch (balanceError) {
      console.log('❌ Could not get balance:', balanceError.message);
    }

    // Try using basic API key/secret auth instead of JWT
    console.log('\n🔑 Testing Basic Auth (API Key/Secret)...');
    const basicAuth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe"
    });
    
    const basicVonage = new Vonage(basicAuth);
    
    try {
      const basicBalance = await basicVonage.account.getBalance();
      console.log('✅ Basic auth works - Balance:', basicBalance.value, basicBalance.currency);
      
      // Try voice call with basic auth
      console.log('\n📞 Trying voice call with basic auth...');
      try {
        const basicCall = await basicVonage.voice.createOutboundCall({
          to: [{
            type: 'phone', 
            number: '+13472005533'
          }],
          from: {
            type: 'phone',
            number: '14155551212'  // Try with a different format
          },
          answer_url: ['https://raw.githubusercontent.com/nexmo-community/ncco-examples/gh-pages/text-to-speech.json']
        });
        console.log('✅ Basic auth voice call worked!');
        console.log('   Call ID:', basicCall.uuid);
      } catch (basicCallError) {
        console.log('❌ Basic auth voice call failed:');
        console.log('   Error:', basicCallError.message);
        if (basicCallError.response && basicCallError.response.data) {
          console.log('   Response:', JSON.stringify(basicCallError.response.data, null, 2));
        }
      }
      
    } catch (basicError) {
      console.log('❌ Basic auth failed:', basicError.message);
    }

  } catch (error) {
    console.log('❌ Setup error:', error.message);
  }
}

debugVonageApp().catch(console.error);