"use strict";
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME;
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;
const BATCH_SIZE = 25; // DynamoDB batch write limit
exports.handler = async (event) => {
    console.log('Starting DynamoDB loader');
    try {
        // Get the latest processed files from S3
        const listParams = {
            Bucket: OUTPUT_BUCKET,
            Prefix: 'dynamodb/',
            MaxKeys: 1000
        };
        const listResult = await s3.listObjectsV2(listParams).promise();
        if (!listResult.Contents || listResult.Contents.length === 0) {
            throw new Error('No DynamoDB files found in output bucket');
        }
        // Find the most recent items.json file
        const sortedFiles = listResult.Contents
            .filter(obj => obj.Key.endsWith('items.json'))
            .sort((a, b) => b.LastModified - a.LastModified);
        if (sortedFiles.length === 0) {
            throw new Error('No items.json file found');
        }
        const latestFile = sortedFiles[0];
        console.log(`Processing file: ${latestFile.Key}`);
        // Read the JSON file
        const getParams = {
            Bucket: OUTPUT_BUCKET,
            Key: latestFile.Key
        };
        const fileContent = await s3.getObject(getParams).promise();
        const lines = fileContent.Body.toString().trim().split('\n');
        console.log(`Found ${lines.length} items to process`);
        // Process items in batches
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        for (let i = 0; i < lines.length; i += BATCH_SIZE) {
            const batch = lines.slice(i, i + BATCH_SIZE);
            const putRequests = [];
            for (const line of batch) {
                try {
                    const item = JSON.parse(line);
                    // Validate required fields
                    if (!item.phone) {
                        errors.push({
                            index: i + batch.indexOf(line),
                            error: 'Missing phone number',
                            item: item
                        });
                        errorCount++;
                        continue;
                    }
                    // Convert to DynamoDB format
                    const dynamoItem = {
                        phone: item.phone,
                        name: item.name || '',
                        company: item.company || '',
                        email: item.email || '',
                        website: item.website || '',
                        state_province: item.state_province || '',
                        lead_source: item.lead_source || 'web',
                        lead_status: item.lead_status || 'Open - Not Contacted',
                        created_date: item.created_date || new Date().toISOString(),
                        owner_alias: item.owner_alias || 'MDL',
                        unread_by_owner: item.unread_by_owner === true,
                        call_transcript: item.call_transcript || '',
                        last_call_date: item.last_call_date || '',
                        call_status: item.call_status || 'not_called',
                        // Add metadata
                        imported_at: new Date().toISOString(),
                        import_batch: latestFile.Key
                    };
                    putRequests.push({
                        PutRequest: {
                            Item: dynamoItem
                        }
                    });
                }
                catch (e) {
                    errors.push({
                        index: i + batch.indexOf(line),
                        error: e.message,
                        line: line.substring(0, 200)
                    });
                    errorCount++;
                }
            }
            // Write batch to DynamoDB
            if (putRequests.length > 0) {
                try {
                    const batchParams = {
                        RequestItems: {
                            [TABLE_NAME]: putRequests
                        }
                    };
                    const result = await dynamodb.batchWrite(batchParams).promise();
                    // Handle unprocessed items
                    if (result.UnprocessedItems &&
                        result.UnprocessedItems[TABLE_NAME] &&
                        result.UnprocessedItems[TABLE_NAME].length > 0) {
                        // Retry unprocessed items with exponential backoff
                        let retryCount = 0;
                        let unprocessed = result.UnprocessedItems[TABLE_NAME];
                        while (unprocessed.length > 0 && retryCount < 3) {
                            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                            const retryResult = await dynamodb.batchWrite({
                                RequestItems: {
                                    [TABLE_NAME]: unprocessed
                                }
                            }).promise();
                            unprocessed = retryResult.UnprocessedItems?.[TABLE_NAME] || [];
                            retryCount++;
                        }
                        if (unprocessed.length > 0) {
                            errorCount += unprocessed.length;
                            errors.push({
                                error: 'Failed to process after retries',
                                count: unprocessed.length
                            });
                        }
                        else {
                            successCount += putRequests.length;
                        }
                    }
                    else {
                        successCount += putRequests.length;
                    }
                }
                catch (e) {
                    console.error('Batch write error:', e);
                    errorCount += putRequests.length;
                    errors.push({
                        error: 'Batch write failed',
                        message: e.message,
                        batchStart: i,
                        batchSize: putRequests.length
                    });
                }
            }
            // Log progress
            if ((i + BATCH_SIZE) % 100 === 0) {
                console.log(`Processed ${i + BATCH_SIZE} items...`);
            }
        }
        // Write results summary
        const summary = {
            timestamp: new Date().toISOString(),
            sourceFile: latestFile.Key,
            totalItems: lines.length,
            successCount: successCount,
            errorCount: errorCount,
            errors: errors.slice(0, 100) // First 100 errors
        };
        const summaryKey = `dynamo-load-summary/${new Date().toISOString().replace(/:/g, '-')}.json`;
        await s3.putObject({
            Bucket: OUTPUT_BUCKET,
            Key: summaryKey,
            Body: JSON.stringify(summary, null, 2),
            ContentType: 'application/json'
        }).promise();
        console.log(`DynamoDB load completed. Success: ${successCount}, Errors: ${errorCount}`);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'DynamoDB load completed',
                summary: {
                    totalItems: lines.length,
                    successCount: successCount,
                    errorCount: errorCount,
                    summaryLocation: `s3://${OUTPUT_BUCKET}/${summaryKey}`
                }
            })
        };
    }
    catch (error) {
        console.error('Error in DynamoDB loader:', error);
        throw error;
    }
};
//# sourceMappingURL=index.js.map