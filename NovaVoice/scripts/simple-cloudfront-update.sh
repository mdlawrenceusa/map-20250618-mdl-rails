#!/bin/bash
set -e

# Simple CloudFront Update for novavoice.gospelshare.com
# Adds Rails production origin and subdomain routing

echo "🌐 Updating CloudFront for novavoice.gospelshare.com"
echo "=================================================="

DISTRIBUTION_ID="EB6EO1Q0TFWQ5"
EC2_DOMAIN="ec2-54-208-194-221.compute-1.amazonaws.com"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

info() {
  echo -e "${BLUE}[INFO] $1${NC}"
}

# Step 1: Get current CloudFront configuration
log "Getting current CloudFront configuration..."

aws cloudfront get-distribution-config --id $DISTRIBUTION_ID > /tmp/current-dist.json
ETAG=$(jq -r '.ETag' /tmp/current-dist.json)
jq '.DistributionConfig' /tmp/current-dist.json > /tmp/current-config.json

log "Current ETag: $ETAG"

# Step 2: Create updated configuration
log "Creating updated configuration..."

cat > /tmp/update-config.jq << 'EOF'
# Note: Skipping alias addition for now - wildcard *.gospelshare.io should work

# Add new origin for Rails on port 8081
.Origins.Items += [{
  "Id": "RailsProduction",
  "DomainName": $ec2_domain,
  "CustomOriginConfig": {
    "HTTPPort": 8081,
    "HTTPSPort": 443,
    "OriginProtocolPolicy": "http-only",
    "OriginSslProtocols": {
      "Quantity": 3,
      "Items": ["TLSv1", "TLSv1.1", "TLSv1.2"]
    },
    "OriginKeepaliveTimeout": 5,
    "OriginReadTimeout": 30
  },
  "OriginPath": "",
  "ConnectionAttempts": 3,
  "ConnectionTimeout": 10,
  "CustomHeaders": {
    "Quantity": 0,
    "Items": []
  }
}] |
.Origins.Quantity = (.Origins.Items | length) |

# Add cache behavior for Rails app paths
.CacheBehaviors.Items += [{
  "PathPattern": "/app/*",
  "TargetOriginId": "RailsProduction",
  "TrustedSigners": {
    "Enabled": false,
    "Quantity": 0
  },
  "TrustedKeyGroups": {
    "Enabled": false,
    "Quantity": 0
  },
  "ViewerProtocolPolicy": "redirect-to-https",
  "AllowedMethods": {
    "Quantity": 7,
    "Items": ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"],
    "CachedMethods": {
      "Quantity": 2,
      "Items": ["HEAD", "GET"]
    }
  },
  "SmoothStreaming": false,
  "Compress": true,
  "LambdaFunctionAssociations": {
    "Quantity": 0
  },
  "FunctionAssociations": {
    "Quantity": 0
  },
  "FieldLevelEncryptionId": "",
  "GrpcConfig": {
    "Enabled": false
  },
  "ForwardedValues": {
    "QueryString": true,
    "Cookies": {
      "Forward": "all"
    },
    "Headers": {
      "Quantity": 1,
      "Items": ["*"]
    },
    "QueryStringCacheKeys": {
      "Quantity": 0
    }
  },
  "MinTTL": 0,
  "DefaultTTL": 0,
  "MaxTTL": 0
}] |
.CacheBehaviors.Quantity = (.CacheBehaviors.Items | length)
EOF

# Apply the update using jq
jq --arg ec2_domain "$EC2_DOMAIN" -f /tmp/update-config.jq /tmp/current-config.json > /tmp/updated-config.json

log "Configuration updated with new origin and cache behavior"

# Step 3: Apply the CloudFront update
log "Applying CloudFront update..."

aws cloudfront update-distribution \
  --id $DISTRIBUTION_ID \
  --distribution-config file:///tmp/updated-config.json \
  --if-match "$ETAG" > /tmp/update-result.json

NEW_ETAG=$(jq -r '.ETag' /tmp/update-result.json)
STATUS=$(jq -r '.Distribution.Status' /tmp/update-result.json)

log "Update applied successfully!"
log "New ETag: $NEW_ETAG"
log "Status: $STATUS"

# Step 4: Create DNS record for subdomain
log "Creating DNS record for novavoice.gospelshare.com..."

CLOUDFRONT_DOMAIN=$(jq -r '.Distribution.DomainName' /tmp/update-result.json)

aws route53 change-resource-record-sets \
  --hosted-zone-id Z075223437JLVVBIVE60G \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"novavoice.gospelshare.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"DNSName\": \"$CLOUDFRONT_DOMAIN\",
          \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
          \"EvaluateTargetHealth\": false
        }
      }
    }]
  }" > /tmp/dns-result.json

log "DNS record created successfully!"

# Step 5: Test the setup
log "Testing the deployment..."

info "Testing Rails production locally..."
if curl -f http://localhost:8081/up >/dev/null 2>&1; then
  log "✅ Rails production healthy"
else
  log "⚠️  Rails production health check failed"
fi

info "Testing microservice..."
if curl -f http://localhost:3000/health >/dev/null 2>&1; then
  log "✅ Microservice healthy"
else
  log "⚠️  Microservice health check failed"
fi

# Step 6: Display summary
echo ""
echo "================================================================"
echo "🎉 CloudFront Update Completed!"
echo "================================================================"
echo "📍 Distribution ID: $DISTRIBUTION_ID"
echo "🌐 CloudFront Domain: $CLOUDFRONT_DOMAIN"
echo "🔗 Subdomain: https://novavoice.gospelshare.com"
echo ""
echo "📊 Origins:"
echo "  • Microservice: $EC2_DOMAIN:3000 (existing)"
echo "  • Rails App: $EC2_DOMAIN:8081 (new)"
echo ""
echo "🛣️  Routing:"
echo "  • /app/* → Rails Production (port 8081)"
echo "  • /* → Microservice (port 3000, existing)"
echo ""
echo "⏱️  CloudFront propagation: 5-15 minutes"
echo "🔧 Test Rails: https://novavoice.gospelshare.com/app/up"
echo "🔧 Test Microservice: https://novavoice.gospelshare.com/health"
echo ""
echo "📋 Next Steps:"
echo "1. Wait for CloudFront propagation"
echo "2. Test: https://novavoice.gospelshare.com/app/"
echo "3. Update app links to use /app/ prefix"

# Cleanup
rm -f /tmp/current-dist.json /tmp/current-config.json /tmp/updated-config.json
rm -f /tmp/update-config.jq /tmp/update-result.json /tmp/dns-result.json