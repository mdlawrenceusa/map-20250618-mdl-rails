// AWS Credentials Service for NovaVoice Microservice
// Securely retrieves credentials from AWS Secrets Manager and Parameter Store
// Following least privilege principles

import { 
  SecretsManagerClient, 
  GetSecretValueCommand,
  SecretsManagerServiceException 
} from '@aws-sdk/client-secrets-manager';
import { 
  SSMClient, 
  GetParameterCommand, 
  GetParametersCommand,
  SSMServiceException 
} from '@aws-sdk/client-ssm';
import { 
  STSClient, 
  AssumeRoleCommand,
  Credentials as STSCredentials 
} from '@aws-sdk/client-sts';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

interface VonageCredentials {
  api_key: string;
  api_secret: string;
  application_id: string;
  private_key: string;
}

interface CachedItem<T> {
  value: T;
  expiresAt: Date;
}

export class AwsCredentialsService {
  private static instance: AwsCredentialsService;
  private environment: string;
  private region: string;
  private secretsClient: SecretsManagerClient | null = null;
  private ssmClient: SSMClient | null = null;
  private credentialsCache: Map<string, CachedItem<any>> = new Map();
  private cacheTtl: number = 300000; // 5 minutes in milliseconds
  private applicationCredentials: STSCredentials | null = null;

  private constructor() {
    this.environment = process.env.NODE_ENV || 'production';
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  public static getInstance(): AwsCredentialsService {
    if (!AwsCredentialsService.instance) {
      AwsCredentialsService.instance = new AwsCredentialsService();
    }
    return AwsCredentialsService.instance;
  }

  // Get Vonage credentials from Secrets Manager
  public async getVonageCredentials(): Promise<VonageCredentials | null> {
    const secret = await this.getSecret('/novavoice/production/vonage/credentials');
    if (secret) {
      return JSON.parse(secret) as VonageCredentials;
    }
    return null;
  }

  // Get Rails API URL from Parameter Store
  public async getRailsApiUrl(): Promise<string | null> {
    return this.getParameter('/novavoice/production/rails/api_url');
  }

  // Get Redis URL from Parameter Store  
  public async getRedisUrl(): Promise<string | null> {
    return this.getParameter('/novavoice/production/redis/url');
  }

  // Get DynamoDB table names from Parameter Store
  public async getDynamoDBTableNames(): Promise<{churches: string, callRecords: string} | null> {
    const tables = await this.getParameter('/novavoice/production/dynamodb/tables');
    if (tables) {
      return JSON.parse(tables);
    }
    return null;
  }

  // Assume application role for least privilege access
  private async assumeApplicationRole(): Promise<STSCredentials | null> {
    if (this.applicationCredentials && this.isCredentialsValid(this.applicationCredentials)) {
      return this.applicationCredentials;
    }

    try {
      const roleArn = await this.getParameter('/novavoice/production/iam/application_role_arn');
      if (!roleArn) {
        console.error('Application role ARN not found in Parameter Store');
        return null;
      }

      const stsClient = new STSClient({
        region: this.region,
        credentials: fromNodeProviderChain()
      });

      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: `novavoice-microservice-${this.environment}-${Date.now()}`,
        ExternalId: `novavoice-${this.environment}`,
        DurationSeconds: 3600 // 1 hour
      });

      const response = await stsClient.send(command);
      this.applicationCredentials = response.Credentials || null;
      
      return this.applicationCredentials;
    } catch (error) {
      console.error('Failed to assume application role:', error);
      return null;
    }
  }

  private isCredentialsValid(credentials: STSCredentials): boolean {
    if (!credentials.Expiration) return false;
    return new Date(credentials.Expiration) > new Date();
  }

  private async getSecretsClient(): Promise<SecretsManagerClient> {
    if (!this.secretsClient) {
      const credentials = await this.assumeApplicationRole();
      this.secretsClient = new SecretsManagerClient({
        region: this.region,
        credentials: credentials ? {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken!
        } : fromNodeProviderChain()
      });
    }
    return this.secretsClient;
  }

  private async getSsmClient(): Promise<SSMClient> {
    if (!this.ssmClient) {
      const credentials = await this.assumeApplicationRole();
      this.ssmClient = new SSMClient({
        region: this.region,
        credentials: credentials ? {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken!
        } : fromNodeProviderChain()
      });
    }
    return this.ssmClient;
  }

  private async getSecret(secretName: string): Promise<string | null> {
    const cacheKey = `secret:${secretName}`;
    
    // Check cache first
    const cached = this.credentialsCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.value;
    }

    try {
      const client = await this.getSecretsClient();
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await client.send(command);
      
      const secretValue = response.SecretString || null;
      
      // Cache the result
      if (secretValue) {
        this.credentialsCache.set(cacheKey, {
          value: secretValue,
          expiresAt: new Date(Date.now() + this.cacheTtl)
        });
      }
      
      return secretValue;
    } catch (error) {
      if (error instanceof SecretsManagerServiceException) {
        console.error(`Secret not found or access denied: ${secretName}`, error.message);
      } else {
        console.error(`AWS Secrets Manager error for ${secretName}:`, error);
      }
      return null;
    }
  }

  private async getParameter(parameterName: string): Promise<string | null> {
    const cacheKey = `param:${parameterName}`;
    
    // Check cache first
    const cached = this.credentialsCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.value;
    }

    try {
      const client = await this.getSsmClient();
      const command = new GetParameterCommand({ 
        Name: parameterName,
        WithDecryption: true
      });
      const response = await client.send(command);
      
      const parameterValue = response.Parameter?.Value || null;
      
      // Cache the result
      if (parameterValue) {
        this.credentialsCache.set(cacheKey, {
          value: parameterValue,
          expiresAt: new Date(Date.now() + this.cacheTtl)
        });
      }
      
      return parameterValue;
    } catch (error) {
      if (error instanceof SSMServiceException) {
        console.error(`Parameter not found or access denied: ${parameterName}`, error.message);
      } else {
        console.error(`AWS SSM error for ${parameterName}:`, error);
      }
      return null;
    }
  }

  // Clear cached credentials (for security)
  public clearCache(): void {
    this.credentialsCache.clear();
    this.applicationCredentials = null;
    this.secretsClient = null;
    this.ssmClient = null;
  }

  // Initialize all required credentials at startup
  public async initializeCredentials(): Promise<boolean> {
    try {
      console.log('🔐 Initializing AWS credentials...');
      
      const [vonageCredentials, railsApiUrl, redisUrl, dynamoTables] = await Promise.all([
        this.getVonageCredentials(),
        this.getRailsApiUrl(),
        this.getRedisUrl(),
        this.getDynamoDBTableNames()
      ]);

      if (!vonageCredentials) {
        console.error('❌ Failed to load Vonage credentials');
        return false;
      }

      console.log('✅ AWS credentials initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize AWS credentials:', error);
      return false;
    }
  }
}