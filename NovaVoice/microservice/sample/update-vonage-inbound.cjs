const { Vonage } = require('@vonage/server-sdk');
const { Auth } = require('@vonage/auth');
const fs = require('fs');

// Initialize Vonage client
const privateKey = fs.readFileSync('vonage-private-key.pem', 'utf8');

const vonage = new Vonage(new Auth({
  apiKey: '7f45e88f',
  apiSecret: 'qxgEvkklm4VGyfaR',
  applicationId: 'f7fb73da-1cfb-4376-a701-b71c4672f30d',
  privateKey: privateKey
}));

async function updateApplication() {
  try {
    console.log('🔄 Updating Vonage application for INBOUND calls...\n');
    
    const applicationId = 'f7fb73da-1cfb-4376-a701-b71c4672f30d';
    
    // Update application with inbound webhook URLs
    const updatedApp = await vonage.applications.updateApplication({
      id: applicationId,
      name: 'Nova-Sonic-POC',
      capabilities: {
        voice: {
          webhooks: {
            answer_url: {
              address: 'https://gospelshare.io/webhooks/answer',
              http_method: 'GET'
            },
            event_url: {
              address: 'https://gospelshare.io/webhooks/events',
              http_method: 'POST'
            },
            fallback_answer_url: {
              address: 'https://gospelshare.io/webhooks/answer',
              http_method: 'GET'
            }
          }
        }
      }
    });
    
    console.log('✅ Application updated successfully!\n');
    console.log('📞 INBOUND CALL CONFIGURATION:');
    console.log('================================');
    console.log('Application ID:', applicationId);
    console.log('Phone Number: +1-213-523-5700\n');
    
    console.log('🔗 WEBHOOK URLS:');
    console.log('Answer URL:', updatedApp.capabilities.voice.webhooks.answer_url.address);
    console.log('Event URL:', updatedApp.capabilities.voice.webhooks.event_url.address);
    console.log('Fallback URL:', updatedApp.capabilities.voice.webhooks.fallback_answer_url.address);
    
    console.log('\n🧪 TO TEST INBOUND CALLS:');
    console.log('1. Call +1-213-523-5700');
    console.log('2. You should hear: "Hello, welcome to our automated assistant..."');
    console.log('3. The call will connect to Nova S2S for conversation');
    
    console.log('\n📋 MONITOR LOGS:');
    console.log('ssh -i nova-sonic-key-pair.pem ec2-user@54.234.91.73');
    console.log('sudo journalctl -u nova-sonic -f');
    
  } catch (error) {
    console.error('❌ Error updating application:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the update
updateApplication();