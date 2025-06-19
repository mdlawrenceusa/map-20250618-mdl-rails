# AWS IAM Configuration for NovaVoice

## IAM Role Setup

This application uses a dedicated IAM role for secure access to Amazon Nova Sonic.

### Role Details
- **Role Name**: `NovaVoice-NovaSonic-Role`
- **Role ARN**: `arn:aws:iam::302296110959:role/NovaVoice-NovaSonic-Role`

### Permissions
The role has minimal permissions required for Nova Sonic:
- `bedrock:InvokeModel` - For Nova Sonic model invocation
- `bedrock:InvokeModelWithResponseStream` - For streaming responses
- `bedrock:ListFoundationModels` - For model discovery
- `bedrock:GetFoundationModel` - For model metadata

### Trust Policy
The role can be assumed by:
1. EC2 instances (for production deployment)
2. The mdlawrence user (for development)

### Usage
The application automatically assumes this role when initializing the Nova Sonic service. 
If the role assumption fails, it falls back to shared credentials.

To use a different role, set the environment variable:
```bash
export NOVA_SONIC_ROLE_ARN=arn:aws:iam::account:role/YourRoleName
```

### Benefits
- **Least Privilege**: Only permissions needed for Nova Sonic
- **Auditable**: All Nova Sonic API calls are traceable to this role
- **Rotatable**: Can rotate credentials without changing code
- **Environment-Specific**: Different roles for dev/staging/prod