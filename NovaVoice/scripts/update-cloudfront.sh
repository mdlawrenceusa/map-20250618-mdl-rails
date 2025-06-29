#!/bin/bash
set -e

# Update CloudFront to add novavoice.gospelshare.com subdomain
# Routes to Rails production on port 8081

echo "🌐 Adding novavoice.gospelshare.com to existing CloudFront"
echo "========================================================="

DISTRIBUTION_ID="EB6EO1Q0TFWQ5"
EC2_IP="54.208.194.221"

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

# Step 1: Get the correct CloudFront domain name
log "Getting CloudFront domain name..."
CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution --id $DISTRIBUTION_ID --query 'Distribution.DomainName' --output text)
log "CloudFront domain: $CLOUDFRONT_DOMAIN"

# Step 2: Update CloudFront configuration
log "Updating CloudFront distribution..."

# Get current config and ETag
aws cloudfront get-distribution-config --id $DISTRIBUTION_ID > /tmp/current-config.json
ETAG=$(jq -r '.ETag' /tmp/current-config.json)
jq '.DistributionConfig' /tmp/current-config.json > /tmp/dist-config.json

# Update the configuration using jq
jq '
# Add novavoice.gospelshare.com to aliases
.Aliases.Items += ["novavoice.gospelshare.com"] |
.Aliases.Quantity = (.Aliases.Items | length) |

# Add new origin for Rails on port 8081
.Origins.Items += [{
  "Id": "RailsProduction",
  "DomainName": "'$EC2_IP'",
  "CustomOriginConfig": {
    "HTTPPort": 8081,
    "HTTPSPort": 443,
    "OriginProtocolPolicy": "http-only",
    "OriginSslProtocols": {
      "Quantity": 1,
      "Items": ["TLSv1.2"]
    }
  },
  "OriginPath": "",
  "ConnectionAttempts": 3,
  "ConnectionTimeout": 10
}] |
.Origins.Quantity = (.Origins.Items | length) |

# Add cache behavior for novavoice subdomain
.CacheBehaviors.Items += [{
  "PathPattern": "*",
  "TargetOriginId": "RailsProduction",
  "ViewerProtocolPolicy": "redirect-to-https",
  "AllowedMethods": {
    "Quantity": 7,
    "Items": ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    "CachedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    }
  },
  "ForwardedValues": {
    "QueryString": true,
    "Cookies": {"Forward": "all"},
    "Headers": {
      "Quantity": 1,
      "Items": ["*"]
    }
  },
  "MinTTL": 0,
  "DefaultTTL": 0,
  "MaxTTL": 0,
  "Compress": true,
  "TrustedSigners": {
    "Enabled": false,
    "Quantity": 0
  }
}] |
.CacheBehaviors.Quantity = (.CacheBehaviors.Items | length)
' /tmp/dist-config.json > /tmp/updated-config.json

# Apply the update
aws cloudfront update-distribution \
  --id $DISTRIBUTION_ID \
  --distribution-config file:///tmp/updated-config.json \
  --if-match $ETAG

log "CloudFront update initiated ✅"

# Step 3: Start Rails production server
log "Starting Rails production server on port 8081..."

# Stop any existing Rails on 8081
pkill -f "puma.*8081" || true

# Start Rails in production mode
cd /home/ec2-user/environment/map-20250618-mdl-rails/NovaVoice
RAILS_ENV=production PORT=8081 AWS_REGION=us-east-1 \
nohup bin/rails server -b 0.0.0.0 > production-rails.log 2>&1 &

sleep 5

# Test Rails health
if curl -f http://localhost:8081/up >/dev/null 2>&1; then
  log "Rails production server healthy ✅"
else
  log "Rails production server health check failed ⚠️"
fi

# Step 4: Display summary
echo ""
echo "========================================================="
echo "🎉 novavoice.gospelshare.com deployment completed!"
echo "========================================================="
echo "📍 Rails Production: http://localhost:8081"
echo "📍 Microservice: http://localhost:3000 (unchanged)"
echo "🌐 Public URL: https://novavoice.gospelshare.com"
echo ""
echo "⏱️  CloudFront update takes 5-15 minutes to propagate"
echo "📊 Monitor: aws cloudfront get-distribution --id $DISTRIBUTION_ID"
echo "🔧 Logs: tail -f production-rails.log"
echo ""
echo "🚀 Architecture:"
echo "  CloudFront → novavoice.gospelshare.com → Rails:8081"
echo "  Rails:8081 ↔ Microservice:3000 (Vonage + Nova Sonic)"

# Cleanup temp files
rm -f /tmp/current-config.json /tmp/dist-config.json /tmp/updated-config.json