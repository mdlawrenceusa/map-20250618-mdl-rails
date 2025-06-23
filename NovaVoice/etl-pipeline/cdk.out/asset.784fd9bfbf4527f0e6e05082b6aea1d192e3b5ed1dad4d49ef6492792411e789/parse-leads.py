import sys
import json
import re
from datetime import datetime
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from pyspark.sql.functions import col, udf, when, trim, regexp_replace
from pyspark.sql.types import StringType, StructType, StructField, BooleanType, TimestampType
import boto3

# Get job parameters
args = getResolvedOptions(sys.argv, ['JOB_NAME', 'SOURCE_BUCKET', 'SOURCE_KEY', 'OUTPUT_BUCKET'])

sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# Initialize S3 client
s3 = boto3.client('s3')

def parse_lead_record(text_block):
    """Parse a single lead record from text format"""
    lead = {
        'name': '',
        'company': '',
        'phone': '',
        'website': '',
        'state_province': '',
        'lead_source': '',
        'email': '',
        'lead_status': 'Open - Not Contacted',
        'created_date': None,
        'owner_alias': 'MDL',
        'unread_by_owner': False,
        'call_transcript': '',
        'last_call_date': '',
        'call_status': 'not_called'
    }
    
    lines = text_block.strip().split('\n')
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # First line is usually the name
        if i == 0 and line and not line.endswith(':'):
            lead['name'] = line
            i += 1
            continue
            
        if line == 'Company:' and i + 1 < len(lines):
            lead['company'] = lines[i + 1].strip()
            i += 2
            continue
            
        if line == 'Phone:' and i + 1 < len(lines):
            phone = lines[i + 1].strip()
            # Normalize phone number format
            lead['phone'] = normalize_phone_number(phone)
            i += 2
            continue
            
        if line == 'Website:' and i + 1 < len(lines):
            website = lines[i + 1].strip()
            if website and not website.startswith('http'):
                website = 'http://' + website
            lead['website'] = website
            i += 2
            continue
            
        if line == 'State/Province:' and i + 1 < len(lines):
            lead['state_province'] = lines[i + 1].strip()
            i += 2
            continue
            
        if line == 'Lead Source:' and i + 1 < len(lines):
            lead['lead_source'] = lines[i + 1].strip() or 'web'
            i += 2
            continue
            
        if line == 'Email:' and i + 1 < len(lines):
            lead['email'] = lines[i + 1].strip()
            i += 2
            continue
            
        if line == 'Lead Status:' and i + 1 < len(lines):
            status = lines[i + 1].strip()
            lead['lead_status'] = status if status else 'Open - Not Contacted'
            i += 2
            continue
            
        if line == 'Created Date:' and i + 1 < len(lines):
            date_str = lines[i + 1].strip()
            lead['created_date'] = parse_date(date_str)
            i += 2
            continue
            
        if line == 'Owner Alias:' and i + 1 < len(lines):
            alias = lines[i + 1].strip()
            lead['owner_alias'] = alias if alias else 'MDL'
            i += 2
            continue
            
        if line == 'Unread By Owner:' and i + 1 < len(lines):
            value = lines[i + 1].strip().lower()
            lead['unread_by_owner'] = value == 'true'
            i += 2
            continue
            
        i += 1
    
    return lead

def normalize_phone_number(phone):
    """Normalize phone number to consistent format"""
    if not phone:
        return ''
    
    # Remove all non-numeric characters
    digits = re.sub(r'\D', '', phone)
    
    # Handle US numbers (10 or 11 digits)
    if len(digits) == 10:
        # Add US country code
        digits = '1' + digits
    elif len(digits) == 11 and digits[0] == '1':
        # Already has US country code
        pass
    else:
        # Keep as is for international numbers
        pass
    
    # Format as +1 (XXX) XXX-XXXX for US numbers
    if len(digits) == 11 and digits[0] == '1':
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:11]}"
    else:
        # Return with + prefix for international
        return f"+{digits}" if digits else ''

def parse_date(date_str):
    """Parse date string to ISO format"""
    if not date_str:
        return None
    
    # Try common date formats
    formats = [
        '%m/%d/%Y %I:%M %p',
        '%m/%d/%Y %I:%M:%S %p',
        '%Y-%m-%d %H:%M:%S',
        '%m/%d/%Y',
        '%Y-%m-%d'
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.isoformat() + 'Z'
        except ValueError:
            continue
    
    # If no format matches, return current timestamp
    return datetime.utcnow().isoformat() + 'Z'

# Read the source file from S3
print(f"Reading from s3://{args['SOURCE_BUCKET']}/{args['SOURCE_KEY']}")
response = s3.get_object(Bucket=args['SOURCE_BUCKET'], Key=args['SOURCE_KEY'])
content = response['Body'].read().decode('utf-8', errors='ignore')

# Split content into individual lead records
# Records are separated by "Unread By Owner:\nFalse\n" followed by next name
# Let's split using a more specific pattern
lines = content.split('\n')
lead_blocks = []
current_block = []

for i, line in enumerate(lines):
    current_block.append(line)
    
    # Check if this line is "False" and the next line (if exists) looks like a name
    if (line.strip() == 'False' and 
        i + 1 < len(lines) and 
        lines[i + 1].strip() and 
        not lines[i + 1].strip().endswith(':')):
        
        # End current block and start new one
        lead_blocks.append('\n'.join(current_block))
        current_block = []

# Add the last block if it exists
if current_block:
    lead_blocks.append('\n'.join(current_block))

# Parse all leads
parsed_leads = []
errors = []

for i, block in enumerate(lead_blocks):
    block = block.strip()
    if not block:
        continue
    
    try:
        lead = parse_lead_record(block)
        # Only add if we have a valid phone number (our primary key)
        if lead['phone']:
            parsed_leads.append(lead)
        else:
            errors.append({
                'index': i,
                'error': 'Missing phone number',
                'block': block[:200]  # First 200 chars for debugging
            })
    except Exception as e:
        errors.append({
            'index': i,
            'error': str(e),
            'block': block[:200]
        })

print(f"Successfully parsed {len(parsed_leads)} leads")
print(f"Encountered {len(errors)} errors")

# Convert to Spark DataFrame
schema = StructType([
    StructField("phone", StringType(), False),
    StructField("name", StringType(), True),
    StructField("company", StringType(), True),
    StructField("email", StringType(), True),
    StructField("website", StringType(), True),
    StructField("state_province", StringType(), True),
    StructField("lead_source", StringType(), True),
    StructField("lead_status", StringType(), True),
    StructField("created_date", StringType(), True),
    StructField("owner_alias", StringType(), True),
    StructField("unread_by_owner", BooleanType(), True),
    StructField("call_transcript", StringType(), True),
    StructField("last_call_date", StringType(), True),
    StructField("call_status", StringType(), True)
])

df = spark.createDataFrame(parsed_leads, schema)

# Data quality checks
df = df.filter(col("phone").isNotNull() & (col("phone") != ""))
df = df.dropDuplicates(["phone"])  # Ensure phone numbers are unique

# Show sample data
print("Sample parsed data:")
df.show(5, truncate=False)

# Write outputs
timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')

# Write JSON for Lambda processing
json_path = f"s3://{args['OUTPUT_BUCKET']}/processed/{timestamp}/leads.json"
df.coalesce(1).write.mode('overwrite').json(json_path)
print(f"Written JSON to {json_path}")

# Write DynamoDB-formatted JSON (one item per line for batch processing)
dynamo_df = df.select(
    col("phone"),
    col("name"),
    col("company"),
    col("email"),
    col("website"),
    col("state_province"),
    col("lead_source"),
    col("lead_status"),
    col("created_date"),
    col("owner_alias"),
    col("unread_by_owner"),
    col("call_transcript"),
    col("last_call_date"),
    col("call_status")
)

dynamo_path = f"s3://{args['OUTPUT_BUCKET']}/dynamodb/{timestamp}/items.json"
dynamo_df.coalesce(1).write.mode('overwrite').option("multiLine", "false").json(dynamo_path)
print(f"Written DynamoDB items to {dynamo_path}")

# Write processing summary
summary = {
    'timestamp': timestamp,
    'total_records': len(lead_blocks),
    'successful_records': len(parsed_leads),
    'failed_records': len(errors),
    'unique_phone_numbers': df.count(),
    'duplicate_phones_removed': len(parsed_leads) - df.count(),
    'errors': errors[:100]  # First 100 errors for debugging
}

summary_path = f"s3://{args['OUTPUT_BUCKET']}/summary/{timestamp}/processing_summary.json"
s3.put_object(
    Bucket=args['OUTPUT_BUCKET'],
    Key=f"summary/{timestamp}/processing_summary.json",
    Body=json.dumps(summary, indent=2),
    ContentType='application/json'
)
print(f"Written summary to {summary_path}")

job.commit()
print("Glue job completed successfully")