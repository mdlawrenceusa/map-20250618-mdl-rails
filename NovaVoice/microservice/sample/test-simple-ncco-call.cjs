#!/usr/bin/env node

/**
 * Test Simple Voice Call with Direct NCCO (No Webhooks Required)
 */

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

async function testSimpleNCCOCall() {
  console.log('📞 TESTING SIMPLE VOICE CALL WITH DIRECT NCCO');
  console.log('=============================================\n');

  try {
    const privateKey = fs.readFileSync('/home/ec2-user/environment/nova-telephony-poc/vonage-private-key.pem', 'utf8');
    
    const auth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe",
      applicationId: "f7fb73da-1cfb-4376-a701-b71c4672f30d",
      privateKey: privateKey
    });

    const vonage = new Vonage(auth);

    console.log('📞 Creating church outreach call...');
    
    // Use direct NCCO instead of webhook URLs
    const callParams = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone',
        number: 'Nova Sonic'
      },
      ncco: [
        {
          action: "talk",
          text: "Hello, this is Esther calling from Mike Lawrence Productions. We have an exciting Off-Broadway quality illusion show ministry that has proven very effective for church outreach and evangelism. I would love to schedule a brief 15-minute web meeting with your pastor to show how this could benefit your church's ministry. Please call us back when convenient. Thank you and God bless.",
          voiceName: "Amy"
        }
      ]
    };

    console.log('📱 Calling +13472005533 as Esther from Mike Lawrence Productions...');

    try {
      const result = await vonage.voice.createOutboundCall(callParams);
      console.log('✅ CHURCH OUTREACH CALL SUCCESSFUL!');
      console.log('   Call ID:', result.uuid);
      console.log('   Status:', result.status);
      console.log('   Direction:', result.direction);
      console.log('\n🎉 SUCCESS! Esther is now calling about Gospel magic show ministry!');
      console.log('   📞 The phone should ring at +13472005533');
      console.log('   💬 AI Message: Church outreach about Off-Broadway illusion show ministry');
      console.log('   🎯 Objective: Schedule 15-minute web meeting with pastor');
      
      return result;
      
    } catch (callError) {
      console.log('❌ Church outreach call failed:');
      console.log('   Error:', callError.message);
      if (callError.response && callError.response.data) {
        console.log('   Status:', callError.response.status);
        console.log('   Response:', JSON.stringify(callError.response.data, null, 2));
      }
      
      // If the error is about authentication, suggest alternatives
      if (callError.message.includes('401') || callError.message.includes('unauthorized')) {
        console.log('\n💡 TROUBLESHOOTING SUGGESTIONS:');
        console.log('   1. Verify the Application ID has Voice capability enabled');
        console.log('   2. Check if the private key matches the Application ID'); 
        console.log('   3. Ensure the Vonage account has sufficient balance');
        console.log('   4. Try using API Key/Secret authentication instead of JWT');
      }
      
      return null;
    }

  } catch (error) {
    console.log('❌ Setup failed:', error.message);
    return null;
  }
}

// Also test with basic authentication as fallback
async function testWithBasicAuth() {
  console.log('\n🔑 TESTING WITH BASIC API KEY/SECRET AUTH');
  console.log('=========================================\n');
  
  try {
    const basicAuth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe"
    });
    
    const basicVonage = new Vonage(basicAuth);
    
    const callParams = {
      to: [{
        type: 'phone',
        number: '+13472005533'
      }],
      from: {
        type: 'phone', 
        number: 'Vonage'
      },
      ncco: [
        {
          action: "talk",
          text: "Hello, this is Esther calling from Mike Lawrence Productions about our Gospel magic show ministry. Please call us back to schedule a meeting. Thank you.",
          voiceName: "Amy"
        }
      ]
    };

    console.log('📞 Attempting call with basic auth...');
    
    const result = await basicVonage.voice.createOutboundCall(callParams);
    console.log('✅ BASIC AUTH CALL SUCCESSFUL!');
    console.log('   Call ID:', result.uuid);
    console.log('   Status:', result.status);
    
    return result;
    
  } catch (error) {
    console.log('❌ Basic auth call failed:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 NOVA SONIC CHURCH OUTREACH CALLING TEST');
  console.log('==========================================\n');
  
  // Try JWT authentication first
  const jwtResult = await testSimpleNCCOCall();
  
  // If JWT fails, try basic auth
  if (!jwtResult) {
    console.log('\n🔄 JWT failed, trying basic authentication...');
    await testWithBasicAuth();
  }
  
  console.log('\n🎯 CHURCH OUTREACH TEST COMPLETE');
  console.log('   If successful, +13472005533 should have received a call from Esther');
  console.log('   about Mike Lawrence Productions Gospel magic show ministry!');
}

if (require.main === module) {
  main().catch(console.error);
}