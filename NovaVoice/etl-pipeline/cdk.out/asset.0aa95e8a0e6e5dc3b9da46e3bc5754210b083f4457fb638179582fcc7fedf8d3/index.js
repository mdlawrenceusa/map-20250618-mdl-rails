const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const TABLE_NAME = process.env.TABLE_NAME;
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;

exports.handler = async (event) => {
    console.log('Starting data validation');
    
    try {
        const validationResults = {
            timestamp: new Date().toISOString(),
            checks: [],
            warnings: [],
            errors: []
        };
        
        // Check 1: Count total items in DynamoDB
        const scanParams = {
            TableName: TABLE_NAME,
            Select: 'COUNT'
        };
        
        let totalCount = 0;
        let lastEvaluatedKey = null;
        
        do {
            if (lastEvaluatedKey) {
                scanParams.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const scanResult = await dynamodb.scan(scanParams).promise();
            totalCount += scanResult.Count;
            lastEvaluatedKey = scanResult.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        
        validationResults.checks.push({
            name: 'Total items in DynamoDB',
            value: totalCount,
            status: totalCount > 0 ? 'PASS' : 'FAIL'
        });
        
        // Check 2: Sample data quality checks
        const sampleParams = {
            TableName: TABLE_NAME,
            Limit: 100
        };
        
        const sampleResult = await dynamodb.scan(sampleParams).promise();
        const sampleItems = sampleResult.Items;
        
        // Validate phone number formats
        let validPhones = 0;
        let invalidPhones = [];
        const phoneRegex = /^\+1 \(\d{3}\) \d{3}-\d{4}$/;
        
        sampleItems.forEach(item => {
            if (phoneRegex.test(item.phone)) {
                validPhones++;
            } else {
                invalidPhones.push({
                    phone: item.phone,
                    name: item.name
                });
            }
        });
        
        validationResults.checks.push({
            name: 'Phone format validation (sample)',
            validCount: validPhones,
            invalidCount: invalidPhones.length,
            sampleSize: sampleItems.length,
            invalidExamples: invalidPhones.slice(0, 5),
            status: invalidPhones.length === 0 ? 'PASS' : 'WARNING'
        });
        
        // Check 3: Required fields completeness
        const requiredFields = ['phone', 'lead_status', 'owner_alias', 'call_status'];
        const fieldCompleteness = {};
        
        requiredFields.forEach(field => {
            fieldCompleteness[field] = {
                complete: 0,
                missing: 0
            };
        });
        
        sampleItems.forEach(item => {
            requiredFields.forEach(field => {
                if (item[field] && item[field].trim() !== '') {
                    fieldCompleteness[field].complete++;
                } else {
                    fieldCompleteness[field].missing++;
                }
            });
        });
        
        validationResults.checks.push({
            name: 'Required fields completeness',
            fields: fieldCompleteness,
            status: Object.values(fieldCompleteness).every(f => f.missing === 0) ? 'PASS' : 'WARNING'
        });
        
        // Check 4: Check for duplicate phone numbers (using GSI query)
        // This is a spot check - full duplicate detection would be expensive
        const phoneCheckPromises = sampleItems.slice(0, 10).map(async (item) => {
            const queryParams = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'phone = :phone',
                ExpressionAttributeValues: {
                    ':phone': item.phone
                }
            };
            
            try {
                const result = await dynamodb.query(queryParams).promise();
                return {
                    phone: item.phone,
                    count: result.Count
                };
            } catch (e) {
                // Query might fail if phone is not properly indexed
                return null;
            }
        });
        
        const phoneChecks = (await Promise.all(phoneCheckPromises)).filter(r => r !== null);
        const duplicates = phoneChecks.filter(r => r.count > 1);
        
        if (duplicates.length > 0) {
            validationResults.warnings.push({
                type: 'Potential duplicates',
                message: `Found ${duplicates.length} potential duplicate phone numbers in sample`,
                examples: duplicates
            });
        }
        
        // Check 5: Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        let validEmails = 0;
        let invalidEmails = [];
        let missingEmails = 0;
        
        sampleItems.forEach(item => {
            if (!item.email || item.email.trim() === '') {
                missingEmails++;
            } else if (emailRegex.test(item.email)) {
                validEmails++;
            } else {
                invalidEmails.push({
                    email: item.email,
                    name: item.name
                });
            }
        });
        
        validationResults.checks.push({
            name: 'Email validation (sample)',
            validCount: validEmails,
            invalidCount: invalidEmails.length,
            missingCount: missingEmails,
            sampleSize: sampleItems.length,
            invalidExamples: invalidEmails.slice(0, 5),
            status: invalidEmails.length === 0 ? 'PASS' : 'WARNING'
        });
        
        // Check 6: Lead status distribution
        const statusCounts = {};
        sampleItems.forEach(item => {
            const status = item.lead_status || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        validationResults.checks.push({
            name: 'Lead status distribution',
            distribution: statusCounts,
            status: 'INFO'
        });
        
        // Check 7: Call status distribution
        const callStatusCounts = {};
        sampleItems.forEach(item => {
            const status = item.call_status || 'not_called';
            callStatusCounts[status] = (callStatusCounts[status] || 0) + 1;
        });
        
        validationResults.checks.push({
            name: 'Call status distribution',
            distribution: callStatusCounts,
            expectedValue: 'not_called',
            status: callStatusCounts['not_called'] === sampleItems.length ? 'PASS' : 'WARNING'
        });
        
        // Generate validation report
        const reportKey = `validation-reports/${new Date().toISOString().replace(/:/g, '-')}.json`;
        await s3.putObject({
            Bucket: OUTPUT_BUCKET,
            Key: reportKey,
            Body: JSON.stringify(validationResults, null, 2),
            ContentType: 'application/json'
        }).promise();
        
        // Determine overall validation status
        const failedChecks = validationResults.checks.filter(c => c.status === 'FAIL');
        const warningChecks = validationResults.checks.filter(c => c.status === 'WARNING');
        
        const overallStatus = failedChecks.length > 0 ? 'FAILED' : 
                             warningChecks.length > 0 ? 'PASSED_WITH_WARNINGS' : 'PASSED';
        
        console.log(`Validation completed with status: ${overallStatus}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Data validation completed',
                status: overallStatus,
                summary: {
                    totalItems: totalCount,
                    checksPerformed: validationResults.checks.length,
                    failures: failedChecks.length,
                    warnings: warningChecks.length,
                    reportLocation: `s3://${OUTPUT_BUCKET}/${reportKey}`
                }
            })
        };
        
    } catch (error) {
        console.error('Error in data validation:', error);
        throw error;
    }
};