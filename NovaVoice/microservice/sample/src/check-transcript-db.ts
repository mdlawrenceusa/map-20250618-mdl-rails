import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

async function checkTranscriptRecord() {
  const client = new DynamoDBClient({ region: 'us-east-1' });
  const callId = '80faea6e29c07af03375e2aa17fefce6';
  
  try {
    const result = await client.send(new GetItemCommand({
      TableName: 'nova-sonic-call-records',
      Key: {
        call_uuid: { S: callId }
      }
    }));
    
    if (result.Item) {
      console.log('✅ Found DynamoDB record:');
      console.log('Call UUID:', result.Item.call_uuid?.S);
      console.log('Phone Number:', result.Item.phone_number?.S);
      console.log('Start Time:', result.Item.start_time?.S);
      console.log('End Time:', result.Item.end_time?.S);
      console.log('Duration:', result.Item.duration_seconds?.N, 'seconds');
      console.log('Status:', result.Item.status?.S);
      console.log('Transcript Length:', result.Item.transcript?.S?.length, 'characters');
      console.log('Transcript Preview:', result.Item.transcript?.S?.substring(0, 200) + '...');
    } else {
      console.log('❌ No DynamoDB record found');
    }
  } catch (error) {
    console.error('Error checking DynamoDB:', error);
  }
}

checkTranscriptRecord();