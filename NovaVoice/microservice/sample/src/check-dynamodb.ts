import { DynamoDBClient, DescribeTableCommand, CreateTableCommand } from '@aws-sdk/client-dynamodb';

async function checkAndCreateTable() {
  const client = new DynamoDBClient({ region: 'us-east-1' });
  const tableName = 'nova-sonic-call-records';
  
  try {
    // Check if table exists
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`✅ Table '${tableName}' exists`);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`❌ Table '${tableName}' does not exist. Creating...`);
      
      // Create table
      try {
        await client.send(new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: 'call_uuid', KeyType: 'HASH' }
          ],
          AttributeDefinitions: [
            { AttributeName: 'call_uuid', AttributeType: 'S' }
          ],
          BillingMode: 'PAY_PER_REQUEST'
        }));
        console.log(`✅ Table '${tableName}' created successfully`);
      } catch (createError) {
        console.error('Failed to create table:', createError);
      }
    } else {
      console.error('Error checking table:', error);
    }
  }
}

checkAndCreateTable();