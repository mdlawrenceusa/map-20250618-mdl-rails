# Leads ETL Pipeline

This CDK stack implements an ETL pipeline for processing church lead data from S3 to DynamoDB, with Rails integration support.

## Architecture

The pipeline consists of:
1. **AWS Glue Job**: Parses leads.txt from S3 and transforms to structured JSON
2. **DynamoDB Table**: Stores church data with phone number as primary key
3. **Lambda Functions**:
   - DynamoDB Loader: Batch loads data into DynamoDB
   - Rails Seeds Generator: Creates seeds.rb file for Rails app
   - Data Validator: Validates data quality and consistency
4. **Step Functions**: Orchestrates the entire workflow
5. **SNS Notifications**: Alerts on completion or failure

## Prerequisites

- AWS CDK v2 installed (`npm install -g aws-cdk`)
- AWS credentials configured
- Node.js 18.x or later
- TypeScript

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure CDK (if not already done):
```bash
cdk bootstrap
```

## Configuration

Edit `bin/app.ts` to customize:
- Source bucket and key (default: `globaloutreachevent.com/leads.txt`)
- Notification email address
- AWS region

## Deployment

1. Build the TypeScript:
```bash
npm run build
```

2. Deploy the stack:
```bash
cdk deploy
```

3. Note the outputs:
- OutputBucketName: S3 bucket for processed files
- DynamoTableName: DynamoDB table name
- StateMachineArn: Step Functions ARN for running the pipeline

## Running the Pipeline

### Option 1: Via AWS Console
1. Go to Step Functions in AWS Console
2. Find "leads-etl-pipeline"
3. Click "Start execution"
4. Use default input or customize

### Option 2: Via AWS CLI
```bash
aws stepfunctions start-execution \
  --state-machine-arn <StateMachineArn from output> \
  --name "etl-run-$(date +%Y%m%d-%H%M%S)"
```

## Data Schema

### DynamoDB Schema (Phone as Primary Key)
```json
{
  "phone": "+1 (516) 938-0383",  // Primary Key
  "name": "Jong Hoon Kim",
  "company": "Yale Presbyterian Church in New York",
  "email": "jongjoy04@yahoo.com",
  "website": "http://example.com",
  "state_province": "NY",
  "lead_source": "web",
  "lead_status": "Open - Not Contacted",
  "created_date": "2018-09-02T23:20:00.000Z",
  "owner_alias": "MDL",
  "unread_by_owner": false,
  "call_transcript": "",
  "last_call_date": "",
  "call_status": "not_called"
}
```

### Input Data Format
The pipeline expects leads.txt with records in this format:
```
Jong Hoon Kim
Company:
Yale Presbyterian Church in New York
Phone:
(516) 938-0383
Website:
State/Province:
Lead Source:
Email:
jongjoy04@yahoo.com
Lead Status:
Open - Not Contacted
Created Date:
9/2/2018 11:20 PM
Owner Alias:
MDL
Unread By Owner:
False
```

## Output Files

After running, check the output bucket for:

1. **Processed JSON**: `processed/<timestamp>/leads.json`
2. **DynamoDB Items**: `dynamodb/<timestamp>/items.json`
3. **Rails Seeds**: `rails-seeds/<timestamp>/seeds.rb`
4. **Sample Seeds**: `rails-seeds/<timestamp>/sample_seeds.rb` (first 25 records)
5. **Processing Summary**: `summary/<timestamp>/processing_summary.json`
6. **Validation Report**: `validation-reports/<timestamp>.json`

## Using the Rails Seeds

1. Download the generated seeds.rb:
```bash
aws s3 cp s3://<output-bucket>/rails-seeds/<timestamp>/seeds.rb db/seeds.rb
```

2. Or for testing, use the sample:
```bash
aws s3 cp s3://<output-bucket>/rails-seeds/<timestamp>/sample_seeds.rb db/seeds.rb
```

3. Run in your Rails app:
```bash
rails db:seed
```

## Monitoring

- **CloudWatch Logs**: Check `/aws/glue/jobs/leads-parser-job` for Glue logs
- **Lambda Logs**: Check `/aws/lambda/<function-name>` for each Lambda
- **Step Functions**: Visual workflow execution in console
- **CloudWatch Dashboard**: `leads-etl-pipeline-dashboard` for metrics

## Nova Sonic Integration

The DynamoDB table is designed for the Nova Sonic calling system:
- Phone number serves as the unique identifier
- Call transcripts and status are updated after each call
- Rails app uses phone number to link records

## Troubleshooting

### Common Issues

1. **Glue Job Fails**:
   - Check CloudWatch logs for parsing errors
   - Verify source file format matches expected structure
   - Ensure S3 permissions are correct

2. **DynamoDB Load Errors**:
   - Check for duplicate phone numbers
   - Verify phone number format normalization
   - Monitor throttling metrics

3. **Seeds Generation Issues**:
   - Ensure all required fields are present
   - Check date format parsing
   - Verify Ruby syntax in output

### Data Quality Checks

The validation Lambda performs:
- Phone number format validation
- Email format validation
- Required fields completeness
- Duplicate detection (sample)
- Status distribution analysis

## Cost Optimization

- DynamoDB is configured for on-demand billing
- Glue job uses minimal DPUs
- Lambda functions have appropriate memory settings
- S3 lifecycle rules clean up old processed files

## Security

- All data encrypted at rest (S3, DynamoDB)
- IAM roles follow least privilege
- No credentials stored in code
- VPC endpoints can be added if needed

## Clean Up

To remove all resources:
```bash
cdk destroy
```

Note: DynamoDB table has retention policy RETAIN - manually delete if needed.

## Development

### Testing Locally

1. Test Glue script locally:
```bash
cd glue-scripts
python parse-leads.py --JOB_NAME=test --SOURCE_BUCKET=test --SOURCE_KEY=test --OUTPUT_BUCKET=test
```

2. Test Lambda functions:
```bash
cd lambda/dynamo-loader
npm test
```

### Adding Features

1. Modify the CDK stack in `lib/leads-etl-pipeline-stack.ts`
2. Update Lambda functions as needed
3. Run `cdk diff` to see changes
4. Deploy with `cdk deploy`

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review Step Functions execution history
3. Validate data in DynamoDB console
4. Check S3 output files for processing summaries