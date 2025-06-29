# AWS Credentials Initializer
# Securely loads credentials from AWS Secrets Manager and Parameter Store
# Replaces ENV variables with AWS-managed secrets

if false # Disabled - using basic credentials for now
  Rails.application.configure do
    # Initialize AWS credentials service
    aws_creds = AwsCredentialsService.instance

    # Configure database connection using AWS credentials
    config.before_configuration do
      if database_url = aws_creds.database_url
        ENV['DATABASE_URL'] = database_url
      end
    end

    # Load Rails secrets from AWS Secrets Manager
    config.after_initialize do
      begin
        rails_secrets = aws_creds.rails_secrets
        
        if rails_secrets
          # Set Rails master key if not already set
          if rails_secrets[:rails_master_key].present?
            Rails.application.credentials.instance_variable_set(
              :@key_path, 
              StringIO.new(rails_secrets[:rails_master_key])
            )
          end

          # Set secret key base
          if rails_secrets[:secret_key_base].present?
            Rails.application.config.secret_key_base = rails_secrets[:secret_key_base]
          end
        end

        # Note: Vonage credentials are handled by the microservice, not Rails
        # Rails only needs to communicate with the microservice via HTTP

        # Load application configuration from Parameter Store
        rails_config = aws_creds.rails_config
        if rails_config
          config.solid_queue_in_puma = rails_config[:solid_queue_in_puma] == 'true'
          
          # Set Puma configuration
          if defined?(Puma)
            Puma::DSL.new(Puma.cli_config) do |dsl|
              dsl.workers(rails_config[:web_concurrency]&.to_i || 2)
              dsl.threads(1, rails_config[:max_threads]&.to_i || 5)
            end
          end
        end

        # Configure Redis from Parameter Store
        if redis_url = aws_creds.redis_url
          config.cache_store = :redis_cache_store, { url: redis_url }
          config.session_store = :redis_store, { 
            servers: [redis_url],
            expire_after: 1.week
          }
        end

        # Set microservice URL
        if microservice_url = aws_creds.microservice_url
          Rails.application.config.x.microservice_url = microservice_url
        end

        # Set AWS region
        if aws_region = aws_creds.aws_region
          ENV['AWS_REGION'] = aws_region
        end

        Rails.logger.info "🔐 AWS credentials loaded successfully"
        
      rescue => e
        Rails.logger.error "❌ Failed to load AWS credentials: #{e.message}"
        Rails.logger.error e.backtrace.join("\n")
        
        # Fallback to environment variables in development/test
        unless Rails.env.production?
          Rails.logger.warn "⚠️  Falling back to environment variables"
        else
          raise "AWS credentials required in production environment"
        end
      end
    end
  end

  # Clear AWS credentials cache on application reload
  Rails.application.config.to_prepare do
    AwsCredentialsService.instance.clear_cache! if defined?(AwsCredentialsService)
  end
end