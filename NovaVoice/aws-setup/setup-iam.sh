#!/bin/bash

# NovaVoice IAM Setup Script
# Creates IAM role, policy, and instance profile following AWS best practices

set -e

ROLE_NAME="NovaVoice-Microservice-Role"
POLICY_NAME="NovaVoice-Microservice-Policy"
INSTANCE_PROFILE_NAME="NovaVoice-Microservice-InstanceProfile"

echo "🔐 Setting up IAM role for NovaVoice microservice..."

# Get current instance ID
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
echo "Current instance ID: $INSTANCE_ID"

# 1. Create IAM policy
echo "📝 Creating IAM policy..."
aws iam create-policy \
  --policy-name "$POLICY_NAME" \
  --policy-document file://novavoice-iam-policy.json \
  --description "Policy for NovaVoice microservice with Bedrock, S3, DynamoDB, and Secrets Manager access" \
  --path "/novavoice/" || echo "Policy may already exist"

# Get policy ARN
POLICY_ARN=$(aws iam list-policies --path-prefix "/novavoice/" --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" --output text)
echo "Policy ARN: $POLICY_ARN"

# 2. Create IAM role
echo "👤 Creating IAM role..."
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document file://trust-policy.json \
  --description "IAM role for NovaVoice microservice on EC2" \
  --path "/novavoice/" || echo "Role may already exist"

# 3. Attach policy to role
echo "🔗 Attaching policy to role..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$POLICY_ARN"

# 4. Create instance profile
echo "📋 Creating instance profile..."
aws iam create-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" \
  --path "/novavoice/" || echo "Instance profile may already exist"

# 5. Add role to instance profile
echo "➕ Adding role to instance profile..."
aws iam add-role-to-instance-profile \
  --instance-profile-name "$INSTANCE_PROFILE_NAME" \
  --role-name "$ROLE_NAME" || echo "Role may already be in instance profile"

# Wait for IAM propagation
echo "⏳ Waiting for IAM propagation..."
sleep 10

# 6. Attach instance profile to current EC2 instance
echo "🔌 Attaching instance profile to EC2 instance..."
aws ec2 associate-iam-instance-profile \
  --instance-id "$INSTANCE_ID" \
  --iam-instance-profile Name="$INSTANCE_PROFILE_NAME" || echo "Instance profile may already be attached"

echo "✅ IAM setup complete!"
echo "Role ARN: arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/novavoice/$ROLE_NAME"
echo "Instance Profile ARN: arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):instance-profile/novavoice/$INSTANCE_PROFILE_NAME"
echo ""
echo "⚠️  Note: It may take a few minutes for the instance profile to become active."
echo "📝 Check status with: curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/"