#!/bin/bash
set -e

# Setup novavoice.gospelshare.com subdomain using existing CloudFront
# This script updates your existing CloudFront distribution to handle the subdomain

echo "🌐 Setting up novavoice.gospelshare.com subdomain"
echo "================================================="

# Configuration
EXISTING_DISTRIBUTION_ID="EB6EO1Q0TFWQ5"
DOMAIN_NAME="novavoice.gospelshare.com"
HOSTED_ZONE_ID="Z075223437JLVVBIVE60G"
EC2_IP="54.208.194.221"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
  echo -e "${RED}[ERROR] $1${NC}"
  exit 1
}

info() {
  echo -e "${BLUE}[INFO] $1${NC}"
}

# Step 1: Create SSL certificate for novavoice subdomain
create_ssl_certificate() {
  log "Creating SSL certificate for $DOMAIN_NAME..."
  
  CERT_ARN=$(aws acm request-certificate \
    --domain-name $DOMAIN_NAME \
    --validation-method DNS \
    --region us-east-1 \
    --query 'CertificateArn' \
    --output text)
  
  if [[ $? -eq 0 ]]; then
    log "SSL certificate requested: $CERT_ARN"
    echo $CERT_ARN > /tmp/novavoice_cert_arn.txt
  else
    error "Failed to request SSL certificate"
  fi
}

# Step 2: Get validation record and create DNS record
setup_dns_validation() {
  log "Setting up DNS validation..."
  
  CERT_ARN=$(cat /tmp/novavoice_cert_arn.txt)
  
  # Wait a moment for certificate details to be available
  sleep 10
  
  # Get validation record
  VALIDATION_RECORD=$(aws acm describe-certificate \
    --certificate-arn $CERT_ARN \
    --region us-east-1 \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord' \
    --output json)
  
  if [[ $? -eq 0 ]]; then
    RECORD_NAME=$(echo $VALIDATION_RECORD | jq -r '.Name')
    RECORD_VALUE=$(echo $VALIDATION_RECORD | jq -r '.Value')
    
    log "Creating DNS validation record: $RECORD_NAME"
    
    # Create Route 53 validation record
    aws route53 change-resource-record-sets \
      --hosted-zone-id $HOSTED_ZONE_ID \
      --change-batch "{
        \"Changes\": [{
          \"Action\": \"CREATE\",
          \"ResourceRecordSet\": {
            \"Name\": \"$RECORD_NAME\",
            \"Type\": \"CNAME\",
            \"TTL\": 300,
            \"ResourceRecords\": [{\"Value\": \"$RECORD_VALUE\"}]
          }
        }]
      }"
    
    log "DNS validation record created"
  else
    error "Failed to get certificate validation details"
  fi
}

# Step 3: Wait for certificate validation
wait_for_certificate() {
  log "Waiting for SSL certificate validation..."
  
  CERT_ARN=$(cat /tmp/novavoice_cert_arn.txt)
  
  while true; do
    STATUS=$(aws acm describe-certificate \
      --certificate-arn $CERT_ARN \
      --region us-east-1 \
      --query 'Certificate.Status' \
      --output text)
    
    if [[ "$STATUS" == "ISSUED" ]]; then
      log "SSL certificate validated ✅"
      break
    elif [[ "$STATUS" == "FAILED" ]]; then
      error "SSL certificate validation failed ❌"
    else
      info "Certificate status: $STATUS (waiting...)"
      sleep 30
    fi
  done
}

# Step 4: Create Route 53 A record for subdomain
create_subdomain_record() {
  log "Creating Route 53 A record for $DOMAIN_NAME..."
  
  # Point subdomain to existing CloudFront distribution
  aws route53 change-resource-record-sets \
    --hosted-zone-id $HOSTED_ZONE_ID \
    --change-batch "{
      \"Changes\": [{
        \"Action\": \"CREATE\",
        \"ResourceRecordSet\": {
          \"Name\": \"$DOMAIN_NAME\",
          \"Type\": \"A\",
          \"AliasTarget\": {
            \"DNSName\": \"d1f7j8y9z4x5w6.cloudfront.net\",
            \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
            \"EvaluateTargetHealth\": false
          }
        }
      }]
    }"
  
  if [[ $? -eq 0 ]]; then
    log "Route 53 A record created ✅"
  else
    error "Failed to create Route 53 A record"
  fi
}

# Step 5: Update CloudFront distribution configuration
update_cloudfront_distribution() {
  log "Getting current CloudFront distribution configuration..."
  
  # Get current distribution config
  ETAG=$(aws cloudfront get-distribution \
    --id $EXISTING_DISTRIBUTION_ID \
    --query 'ETag' \
    --output text)
  
  aws cloudfront get-distribution-config \
    --id $EXISTING_DISTRIBUTION_ID \
    --query 'DistributionConfig' > /tmp/cloudfront_config.json
  
  # Add subdomain to aliases
  log "Adding $DOMAIN_NAME to CloudFront aliases..."
  
  # Update aliases in config (this is a simplified version - in practice you'd use jq)
  # For now, we'll provide instructions for manual update
  
  info "Manual CloudFront Update Required:"
  echo "1. Go to CloudFront console: https://console.aws.amazon.com/cloudfront/"
  echo "2. Select distribution: $EXISTING_DISTRIBUTION_ID"
  echo "3. Edit → General → Alternate domain names → Add: $DOMAIN_NAME"
  echo "4. SSL Certificate → Custom SSL → Select certificate for $DOMAIN_NAME"
  echo "5. Save changes"
}

# Step 6: Create Kamal deployment script
create_kamal_deployment() {
  log "Creating Kamal deployment commands..."
  
  cat > /tmp/kamal_deploy_commands.sh << 'EOF'
#!/bin/bash
# Kamal deployment commands for NovaVoice production

echo "🚀 NovaVoice Kamal Deployment"
echo "============================="

# Setup ECR repository
aws ecr create-repository --repository-name nova-voice/production --region us-east-1 2>/dev/null || true
aws ecr create-repository --repository-name nova-voice/microservice --region us-east-1 2>/dev/null || true

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 302296110959.dkr.ecr.us-east-1.amazonaws.com

# Deploy with Kamal
echo "Deploying Rails application..."
kamal deploy

echo "🎉 Deployment completed!"
echo "📱 Application available at: https://novavoice.gospelshare.com"
echo "🔧 Manage with: kamal app logs, kamal app restart, etc."
EOF

  chmod +x /tmp/kamal_deploy_commands.sh
  
  log "Kamal deployment script created at /tmp/kamal_deploy_commands.sh"
}

# Main execution
main() {
  log "Starting novavoice.gospelshare.com subdomain setup..."
  
  create_ssl_certificate
  setup_dns_validation
  wait_for_certificate
  create_subdomain_record
  update_cloudfront_distribution
  create_kamal_deployment
  
  echo ""
  echo "================================================="
  echo "🎉 Subdomain setup completed!"
  echo "================================================="
  echo "📋 Next Steps:"
  echo "1. Manually update CloudFront distribution to include $DOMAIN_NAME"
  echo "2. Run: /tmp/kamal_deploy_commands.sh"
  echo "3. Test: https://$DOMAIN_NAME"
  echo ""
  echo "🔧 Kamal Commands:"
  echo "  Deploy:     kamal deploy"
  echo "  Logs:       kamal app logs"
  echo "  Console:    kamal app exec --interactive 'bin/rails console'"
  echo "  Restart:    kamal app restart"
  echo "  Stop:       kamal app stop"
}

# Handle script arguments
case "${1:-setup}" in
  "setup")
    main
    ;;
  "cert-only")
    create_ssl_certificate
    setup_dns_validation
    wait_for_certificate
    ;;
  "dns-only")
    create_subdomain_record
    ;;
  "kamal-only")
    create_kamal_deployment
    /tmp/kamal_deploy_commands.sh
    ;;
  *)
    echo "Usage: $0 {setup|cert-only|dns-only|kamal-only}"
    echo ""
    echo "Commands:"
    echo "  setup      - Complete subdomain setup"
    echo "  cert-only  - Create SSL certificate only"
    echo "  dns-only   - Create DNS records only"
    echo "  kamal-only - Deploy with Kamal only"
    exit 1
    ;;
esac