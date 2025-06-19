#!/bin/bash
# Start Nova Sonic Python Service

cd "$(dirname "$0")"

echo "🐍 Starting Nova Sonic Python Service..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Set environment variables
export AWS_REGION=${AWS_REGION:-us-east-1}
export NOVA_SONIC_ROLE_ARN=${NOVA_SONIC_ROLE_ARN:-arn:aws:iam::302296110959:role/NovaVoice-NovaSonic-Role}
export PORT=${NOVA_SONIC_PYTHON_PORT:-8001}
export HOST=${HOST:-0.0.0.0}

echo "🚀 Starting Nova Sonic service on $HOST:$PORT"
echo "🌍 AWS Region: $AWS_REGION" 
echo "🔐 Role ARN: $NOVA_SONIC_ROLE_ARN"

# Start the service
python nova_sonic_service.py