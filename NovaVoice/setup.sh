#!/bin/bash
set -e

echo "Setting up NovaVoice with Vonage integration..."

# Check if keys directory exists
if [ ! -d "/home/ec2-user/keys" ]; then
  echo "Creating keys directory..."
  mkdir -p /home/ec2-user/keys
  chmod 700 /home/ec2-user/keys
fi

# Check for required environment variables
required_vars=(
  "VONAGE_OUTBOUND_API_KEY"
  "VONAGE_OUTBOUND_API_SECRET"
  "VONAGE_OUTBOUND_APPLICATION_ID"
  "VONAGE_OUTBOUND_NUMBER"
  "VONAGE_INBOUND_API_KEY"
  "VONAGE_INBOUND_API_SECRET"
  "VONAGE_INBOUND_APPLICATION_ID"
)

echo "Checking environment variables..."
missing_vars=()
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
  echo "Warning: Missing environment variables:"
  printf '%s\n' "${missing_vars[@]}"
  echo ""
  echo "Please set these in your .env file or export them before running."
fi

# Check for private key files
if [ ! -f "/home/ec2-user/keys/outbound_private.key" ]; then
  echo "Warning: Outbound private key not found at /home/ec2-user/keys/outbound_private.key"
fi

if [ ! -f "/home/ec2-user/keys/inbound_private.key" ]; then
  echo "Warning: Inbound private key not found at /home/ec2-user/keys/inbound_private.key"
fi

# Install microservice dependencies
echo "Installing microservice dependencies..."
cd microservice
npm install
npm run build
cd ..

# Build Docker images
echo "Building Docker images..."
docker-compose build

echo ""
echo "Setup complete! To start the services, run:"
echo "  docker-compose up"
echo ""
echo "Or to run in detached mode:"
echo "  docker-compose up -d"
echo ""
echo "Endpoints will be available at:"
echo "  Rails app: http://localhost:3000"
echo "  Microservice API: http://localhost:8080"
echo "  WebSocket: ws://localhost:8080/ws"
echo ""
echo "For production with CloudFront:"
echo "  Update WEBHOOK_BASE_URL in your .env file to your CloudFront domain"