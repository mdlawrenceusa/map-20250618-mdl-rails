#!/usr/bin/env node

/**
 * Test Vonage Account Status and Configuration
 */

const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');

async function testAccountStatus() {
  console.log('🔍 VONAGE ACCOUNT STATUS CHECK');
  console.log('=============================\n');

  try {
    // Test basic API key/secret authentication
    const basicAuth = new Auth({
      apiKey: "7f45e88f",
      apiSecret: "zGq4BMH8HQFKzpfe"
    });
    
    const vonage = new Vonage(basicAuth);

    // Check account balance
    console.log('💰 Checking account balance...');
    try {
      const account = await vonage.account.checkBalance();
      console.log('✅ Account balance:', account.value, account.currency);
      console.log('   Auto-reload enabled:', account.autoReload);
    } catch (balanceError) {
      console.log('❌ Balance check failed:', balanceError.message);
    }

    // List numbers
    console.log('\n📞 Checking available numbers...');
    try {
      const numbers = await vonage.numbers.getOwnedNumbers();
      console.log('✅ Numbers found:', numbers.numbers?.length || 0);
      if (numbers.numbers && numbers.numbers.length > 0) {
        numbers.numbers.forEach((num, i) => {
          console.log(`   ${i + 1}. ${num.msisdn} (${num.country}) - Features: ${num.features?.join(', ')}`);
        });
      } else {
        console.log('⚠️  No numbers found - this might be why calls are failing');
        console.log('   You may need to purchase a Vonage phone number for outbound calls');
      }
    } catch (numbersError) {
      console.log('❌ Numbers check failed:', numbersError.message);
    }

    // Check applications  
    console.log('\n📱 Checking applications...');
    try {
      const apps = await vonage.applications.listApplications();
      console.log('✅ Applications found:', apps.applications?.length || 0);
      
      if (apps.applications && apps.applications.length > 0) {
        apps.applications.forEach((app, i) => {
          console.log(`   ${i + 1}. ${app.name} (${app.id})`);
          console.log(`      Capabilities: ${Object.keys(app.capabilities || {}).join(', ')}`);
        });
      }
    } catch (appsError) {
      console.log('❌ Applications check failed:', appsError.message);
    }

    // Test a simple SMS first (easier than voice)
    console.log('\n📱 Testing SMS capability...');
    try {
      // Note: This will actually send an SMS if successful
      const smsResult = await vonage.sms.send({
        to: '13472005533',
        from: 'Nova Sonic',
        text: 'Test message from Nova Sonic telephony system. Please ignore this test message.'
      });
      console.log('✅ SMS test successful!');
      console.log('   Message ID:', smsResult.messages[0]['message-id']);
      console.log('   Status:', smsResult.messages[0]['status']);
    } catch (smsError) {
      console.log('❌ SMS test failed:', smsError.message);
      if (smsError.body) {
        console.log('   Details:', smsError.body);
      }
    }

  } catch (error) {
    console.log('❌ Account setup failed:', error.message);
  }
}

testAccountStatus().catch(console.error);