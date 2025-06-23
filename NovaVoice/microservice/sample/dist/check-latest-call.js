"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
async function checkLatestCall() {
    const client = new client_dynamodb_1.DynamoDBClient({ region: 'us-east-1' });
    const callId = '88ad65e5772769b29e9ecdd18649da05';
    try {
        const result = await client.send(new client_dynamodb_1.GetItemCommand({
            TableName: 'nova-sonic-call-records',
            Key: {
                call_uuid: { S: callId }
            }
        }));
        if (result.Item) {
            console.log('✅ Latest call successfully recorded in DynamoDB!');
            console.log('📞 Call Duration:', result.Item.duration_seconds?.N, 'seconds');
            console.log('📝 Transcript Length:', result.Item.transcript?.S?.length, 'characters');
            console.log('🎯 Status:', result.Item.status?.S);
            console.log('⏰ Started:', new Date(result.Item.start_time?.S || '').toLocaleString());
            console.log('⏱️ Ended:', new Date(result.Item.end_time?.S || '').toLocaleString());
        }
        else {
            console.log('❌ No DynamoDB record found for latest call');
        }
    }
    catch (error) {
        console.error('Error checking DynamoDB:', error);
    }
}
checkLatestCall();
