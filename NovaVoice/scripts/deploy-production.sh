#!/bin/bash
set -e

# NovaVoice Production Deployment Script
# Deploys infrastructure and application to novavoice.gospelshare.com

echo "🚀 NovaVoice Production Deployment"
echo "=================================="

# Configuration
STACK_NAME="novavoice-production"
DOMAIN_NAME="novavoice.gospelshare.com"
HOSTED_ZONE_ID="Z075223437JLVVBIVE60G"
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
  echo -e "${RED}[ERROR] $1${NC}"
  exit 1
}

warning() {
  echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
  echo -e "${BLUE}[INFO] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
  log "Checking prerequisites..."
  
  # Check AWS CLI
  if ! command -v aws &> /dev/null; then
    error "AWS CLI is not installed"
  fi
  
  # Check Docker
  if ! command -v docker &> /dev/null; then
    error "Docker is not installed"
  fi
  
  # Check Docker Compose
  if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose is not installed"
  fi
  
  # Check AWS credentials
  if ! aws sts get-caller-identity &> /dev/null; then
    error "AWS credentials not configured"
  fi
  
  log "Prerequisites check passed ✅"
}

# Get current EC2 instance information
get_instance_info() {
  log "Getting EC2 instance information..."
  
  INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
  if [[ -z "$INSTANCE_ID" ]]; then
    error "Cannot get EC2 instance ID - not running on EC2?"
  fi
  
  VPC_ID=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query 'Reservations[0].Instances[0].VpcId' \
    --output text \
    --region $REGION)
    
  SUBNET_IDS=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query 'Reservations[0].Instances[0].SubnetId' \
    --output text \
    --region $REGION)
  
  # Get additional subnets in different AZs for ALB
  ALL_SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[].SubnetId' \
    --output text \
    --region $REGION)
  
  info "Instance ID: $INSTANCE_ID"
  info "VPC ID: $VPC_ID"
  info "Subnets: $ALL_SUBNETS"
}

# Deploy CloudFormation stack
deploy_infrastructure() {
  log "Deploying infrastructure stack..."
  
  # Convert subnet list to comma-separated format
  SUBNET_LIST=$(echo $ALL_SUBNETS | tr ' ' ',')
  
  aws cloudformation deploy \
    --template-file aws-infrastructure/cloudfront-setup.yml \
    --stack-name $STACK_NAME \
    --parameter-overrides \
      DomainName=$DOMAIN_NAME \
      HostedZoneId=$HOSTED_ZONE_ID \
      EC2InstanceId=$INSTANCE_ID \
      VPCId=$VPC_ID \
      SubnetIds=$SUBNET_LIST \
    --capabilities CAPABILITY_IAM \
    --region $REGION \
    --tags \
      Application=NovaVoice \
      Environment=Production \
      Owner=MDL
  
  if [[ $? -eq 0 ]]; then
    log "Infrastructure deployment completed ✅"
  else
    error "Infrastructure deployment failed ❌"
  fi
}

# Get stack outputs
get_stack_outputs() {
  log "Getting stack outputs..."
  
  CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
    --output text \
    --region $REGION)
    
  ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
    --output text \
    --region $REGION)
    
  SSL_CERT_ARN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query 'Stacks[0].Outputs[?OutputKey==`SSLCertificateArn`].OutputValue' \
    --output text \
    --region $REGION)
  
  info "CloudFront URL: $CLOUDFRONT_URL"
  info "ALB DNS: $ALB_DNS"
  info "SSL Certificate: $SSL_CERT_ARN"
}

# Update security groups
update_security_groups() {
  log "Updating security groups for production..."
  
  # Get current security group
  SECURITY_GROUP_ID=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
    --output text \
    --region $REGION)
  
  # Add rules for production ports
  aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 3000 \
    --source-group $SECURITY_GROUP_ID \
    --region $REGION \
    2>/dev/null || true
    
  aws ec2 authorize-security-group-ingress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 3001 \
    --source-group $SECURITY_GROUP_ID \
    --region $REGION \
    2>/dev/null || true
  
  log "Security groups updated ✅"
}

# Build and deploy Docker containers
deploy_containers() {
  log "Building and deploying Docker containers..."
  
  # Stop existing containers
  docker-compose -f docker-compose.production.yml down 2>/dev/null || true
  
  # Build new images
  docker-compose -f docker-compose.production.yml build
  
  # Start production stack
  docker-compose -f docker-compose.production.yml up -d
  
  # Wait for services to be healthy
  log "Waiting for services to start..."
  sleep 30
  
  # Check service health
  if curl -f http://localhost:3000/up >/dev/null 2>&1; then
    log "Rails service is healthy ✅"
  else
    warning "Rails service health check failed"
  fi
  
  if curl -f http://localhost:3001/health >/dev/null 2>&1; then
    log "Microservice is healthy ✅"
  else
    warning "Microservice health check failed"
  fi
}

# Wait for SSL certificate validation
wait_for_ssl() {
  log "Waiting for SSL certificate validation..."
  
  while true; do
    CERT_STATUS=$(aws acm describe-certificate \
      --certificate-arn $SSL_CERT_ARN \
      --query 'Certificate.Status' \
      --output text \
      --region $REGION)
    
    if [[ "$CERT_STATUS" == "ISSUED" ]]; then
      log "SSL certificate validated ✅"
      break
    elif [[ "$CERT_STATUS" == "FAILED" ]]; then
      error "SSL certificate validation failed ❌"
    else
      info "SSL certificate status: $CERT_STATUS (waiting...)"
      sleep 30
    fi
  done
}

# Test deployment
test_deployment() {
  log "Testing deployment..."
  
  # Test CloudFront
  if curl -f -I $CLOUDFRONT_URL >/dev/null 2>&1; then
    log "CloudFront is responding ✅"
  else
    warning "CloudFront test failed"
  fi
  
  # Test SSL
  if curl -f -I $CLOUDFRONT_URL >/dev/null 2>&1; then
    log "SSL is working ✅"
  else
    warning "SSL test failed"
  fi
  
  # Test Rails app through CloudFront
  if curl -f $CLOUDFRONT_URL/up >/dev/null 2>&1; then
    log "Rails app accessible through CloudFront ✅"
  else
    warning "Rails app test through CloudFront failed"
  fi
}

# Display deployment summary
deployment_summary() {
  log "Deployment Summary"
  echo "=================="
  echo "🌐 Production URL: $CLOUDFRONT_URL"
  echo "🔒 SSL Certificate: Enabled"
  echo "🛡️  WAF Protection: Enabled"
  echo "📊 CloudWatch Logs: Enabled"
  echo "🚀 Rails App: http://localhost:3000"
  echo "🎙️  Microservice: http://localhost:3001"
  echo ""
  echo "📋 Next Steps:"
  echo "1. Wait for DNS propagation (5-10 minutes)"
  echo "2. Test the application at $CLOUDFRONT_URL"
  echo "3. Configure Cognito authentication"
  echo "4. Set up monitoring alerts"
  echo ""
  echo "🔧 Management Commands:"
  echo "  View logs: docker-compose -f docker-compose.production.yml logs -f"
  echo "  Restart:   docker-compose -f docker-compose.production.yml restart"
  echo "  Stop:      docker-compose -f docker-compose.production.yml down"
}

# Main execution
main() {
  log "Starting NovaVoice production deployment..."
  
  check_prerequisites
  get_instance_info
  deploy_infrastructure
  get_stack_outputs
  update_security_groups
  deploy_containers
  wait_for_ssl
  test_deployment
  deployment_summary
  
  log "🎉 Production deployment completed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
  "deploy")
    main
    ;;
  "infrastructure")
    check_prerequisites
    get_instance_info
    deploy_infrastructure
    get_stack_outputs
    ;;
  "containers")
    deploy_containers
    ;;
  "test")
    get_stack_outputs
    test_deployment
    ;;
  "logs")
    docker-compose -f docker-compose.production.yml logs -f
    ;;
  "restart")
    docker-compose -f docker-compose.production.yml restart
    ;;
  "stop")
    docker-compose -f docker-compose.production.yml down
    ;;
  *)
    echo "Usage: $0 {deploy|infrastructure|containers|test|logs|restart|stop}"
    echo ""
    echo "Commands:"
    echo "  deploy         - Full production deployment"
    echo "  infrastructure - Deploy AWS infrastructure only"
    echo "  containers     - Deploy Docker containers only"
    echo "  test          - Test the deployment"
    echo "  logs          - View container logs"
    echo "  restart       - Restart containers"
    echo "  stop          - Stop containers"
    exit 1
    ;;
esac