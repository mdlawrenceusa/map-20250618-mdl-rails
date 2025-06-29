# AWS Credentials Service
# Securely retrieves credentials from AWS Secrets Manager and Parameter Store
# Following least privilege principles

class AwsCredentialsService
  include Singleton

  def initialize
    @environment = Rails.env
    @region = ENV.fetch('AWS_REGION', 'us-east-1')
    @secrets_client = nil
    @ssm_client = nil
    @credentials_cache = {}
    @parameters_cache = {}
    @cache_ttl = 300 # 5 minutes
  end

  # Note: Vonage credentials are handled by the microservice, not Rails

  # Get database credentials from Secrets Manager
  def database_credentials
    get_secret('/novavoice/production/database/credentials') do |secret|
      JSON.parse(secret, symbolize_names: true)
    end
  end

  # Get Rails secrets from Secrets Manager
  def rails_secrets
    get_secret('/novavoice/production/rails/secrets') do |secret|
      JSON.parse(secret, symbolize_names: true)
    end
  end

  # Get microservice URL from Parameter Store
  def microservice_url
    get_parameter('/novavoice/production/microservice/url')
  end

  # Get AWS region from Parameter Store
  def aws_region
    get_parameter('/novavoice/production/aws/region') || @region
  end

  # Get Redis URL from Parameter Store
  def redis_url
    get_parameter('/novavoice/production/redis/url')
  end

  # Get Rails configuration from Parameter Store
  def rails_config
    get_parameter('/novavoice/production/rails/config') do |param|
      JSON.parse(param, symbolize_names: true)
    end
  end

  # Build database URL from credentials and parameters
  def database_url
    creds = database_credentials
    endpoint = get_parameter('/novavoice/production/database/endpoint')
    database = get_parameter('/novavoice/production/database/name') || 'novavoice_shared'
    
    "postgresql://#{creds[:username]}:#{creds[:password]}@#{endpoint}/#{database}"
  end

  # Get IAM role for assuming least privilege access
  def application_role_arn
    get_parameter('/novavoice/production/iam/application_role_arn')
  end

  # Get AWS credentials for Cognito and other services
  def aws_credentials
    # Use default credential chain for Cloud9/EC2 instance profile
    Aws::Credentials.new(
      ENV['AWS_ACCESS_KEY_ID'] || '',
      ENV['AWS_SECRET_ACCESS_KEY'] || ''
    )
  end

  # Assume application role for restricted access
  def assume_application_role
    return @application_credentials if @application_credentials&.valid?

    role_arn = application_role_arn
    return nil unless role_arn

    sts_client = Aws::STS::Client.new(region: @region)
    
    resp = sts_client.assume_role(
      role_arn: role_arn,
      role_session_name: "novavoice-#{@environment}-#{Time.current.to_i}",
      external_id: "novavoice-#{@environment}",
      duration_seconds: 3600 # 1 hour
    )

    @application_credentials = Aws::Credentials.new(
      resp.credentials.access_key_id,
      resp.credentials.secret_access_key,
      resp.credentials.session_token
    )

    @application_credentials
  end

  # Clear cached credentials (for security)
  def clear_cache!
    @credentials_cache.clear
    @parameters_cache.clear
    @application_credentials = nil
  end

  private

  def secrets_client
    @secrets_client ||= Aws::SecretsManager::Client.new(
      region: @region,
      credentials: assume_application_role
    )
  end

  def ssm_client
    @ssm_client ||= Aws::SSM::Client.new(
      region: @region,
      credentials: assume_application_role
    )
  end

  def get_secret(secret_name)
    cache_key = "secret:#{secret_name}"
    
    # Check cache first
    if cached = @credentials_cache[cache_key]
      return cached[:value] if cached[:expires_at] > Time.current
    end

    begin
      resp = secrets_client.get_secret_value(secret_id: secret_name)
      secret_value = resp.secret_string
      
      # Apply block transformation if provided
      result = block_given? ? yield(secret_value) : secret_value
      
      # Cache the result
      @credentials_cache[cache_key] = {
        value: result,
        expires_at: Time.current + @cache_ttl
      }
      
      result
    rescue Aws::SecretsManager::Errors::ResourceNotFoundException
      Rails.logger.error "Secret not found: #{secret_name}"
      nil
    rescue Aws::SecretsManager::Errors::ServiceError => e
      Rails.logger.error "AWS Secrets Manager error: #{e.message}"
      nil
    end
  end

  def get_parameter(parameter_name)
    cache_key = "param:#{parameter_name}"
    
    # Check cache first
    if cached = @parameters_cache[cache_key]
      return cached[:value] if cached[:expires_at] > Time.current
    end

    begin
      resp = ssm_client.get_parameter(
        name: parameter_name,
        with_decryption: true
      )
      
      parameter_value = resp.parameter.value
      
      # Apply block transformation if provided
      result = block_given? ? yield(parameter_value) : parameter_value
      
      # Cache the result
      @parameters_cache[cache_key] = {
        value: result,
        expires_at: Time.current + @cache_ttl
      }
      
      result
    rescue Aws::SSM::Errors::ParameterNotFound
      Rails.logger.error "Parameter not found: #{parameter_name}"
      nil
    rescue Aws::SSM::Errors::ServiceError => e
      Rails.logger.error "AWS SSM error: #{e.message}"
      nil
    end
  end
end