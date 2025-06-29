class CognitoAuthService
  def initialize
    @client = Aws::CognitoIdentityProvider::Client.new(region: 'us-east-1', credentials: AwsCredentialsService.instance.aws_credentials)
    @user_pool_id = ENV['COGNITO_USER_POOL_ID'] || 'us-east-1_p5ee2bmju'
    @client_id = ENV['COGNITO_CLIENT_ID'] || '3v5jtkj2j6r1e31b08p6p77rvm'
    @client_secret = ENV['COGNITO_CLIENT_SECRET'] || 'vggd2hrq4vc5jo57jmvimfueivjr5tf23h3qgb12mv41714a8kq'
  end

  def authenticate(email, password)
    begin
      # Calculate secret hash
      secret_hash = calculate_secret_hash(email)
      
      response = @client.admin_initiate_auth({
        user_pool_id: @user_pool_id,
        client_id: @client_id,
        auth_flow: 'ADMIN_NO_SRP_AUTH',
        auth_parameters: {
          'USERNAME' => email,
          'PASSWORD' => password,
          'SECRET_HASH' => secret_hash
        }
      })

      if response.authentication_result
        {
          success: true,
          access_token: response.authentication_result.access_token,
          refresh_token: response.authentication_result.refresh_token,
          expires_in: response.authentication_result.expires_in,
          user: get_user_info(response.authentication_result.access_token)
        }
      else
        { success: false, error: 'Authentication failed' }
      end
    rescue Aws::CognitoIdentityProvider::Errors::NotAuthorizedException => e
      { success: false, error: 'Invalid email or password' }
    rescue Aws::CognitoIdentityProvider::Errors::UserNotConfirmedException => e
      { success: false, error: 'User account not confirmed' }
    rescue Aws::CognitoIdentityProvider::Errors::UserNotFoundException => e
      { success: false, error: 'User not found' }
    rescue StandardError => e
      Rails.logger.error "Cognito authentication error: #{e.message}"
      { success: false, error: 'Authentication service error' }
    end
  end

  def verify_token(access_token)
    begin
      response = @client.get_user({
        access_token: access_token
      })
      
      {
        success: true,
        user: {
          username: response.username,
          email: response.user_attributes.find { |attr| attr.name == 'email' }&.value,
          sub: response.user_attributes.find { |attr| attr.name == 'sub' }&.value
        }
      }
    rescue Aws::CognitoIdentityProvider::Errors::NotAuthorizedException => e
      { success: false, error: 'Invalid or expired token' }
    rescue StandardError => e
      Rails.logger.error "Token verification error: #{e.message}"
      { success: false, error: 'Token verification failed' }
    end
  end

  def refresh_token(refresh_token, username)
    begin
      secret_hash = calculate_secret_hash(username)
      
      response = @client.admin_initiate_auth({
        user_pool_id: @user_pool_id,
        client_id: @client_id,
        auth_flow: 'REFRESH_TOKEN_AUTH',
        auth_parameters: {
          'REFRESH_TOKEN' => refresh_token,
          'SECRET_HASH' => secret_hash
        }
      })

      if response.authentication_result
        {
          success: true,
          access_token: response.authentication_result.access_token,
          expires_in: response.authentication_result.expires_in
        }
      else
        { success: false, error: 'Token refresh failed' }
      end
    rescue StandardError => e
      Rails.logger.error "Token refresh error: #{e.message}"
      { success: false, error: 'Token refresh failed' }
    end
  end

  def create_user(email, temporary_password, send_email: false)
    begin
      @client.admin_create_user({
        user_pool_id: @user_pool_id,
        username: email,
        user_attributes: [
          { name: 'email', value: email },
          { name: 'email_verified', value: 'true' }
        ],
        temporary_password: temporary_password,
        message_action: send_email ? 'RESEND' : 'SUPPRESS'
      })
      
      { success: true, message: 'User created successfully' }
    rescue Aws::CognitoIdentityProvider::Errors::UsernameExistsException => e
      { success: false, error: 'User already exists' }
    rescue StandardError => e
      Rails.logger.error "User creation error: #{e.message}"
      { success: false, error: 'User creation failed' }
    end
  end

  private

  def calculate_secret_hash(username)
    message = username + @client_id
    OpenSSL::HMAC.digest('sha256', @client_secret, message).then { |digest| Base64.encode64(digest).strip }
  end

  def get_user_info(access_token)
    response = @client.get_user({ access_token: access_token })
    {
      username: response.username,
      email: response.user_attributes.find { |attr| attr.name == 'email' }&.value,
      sub: response.user_attributes.find { |attr| attr.name == 'sub' }&.value
    }
  rescue StandardError => e
    Rails.logger.error "Error getting user info: #{e.message}"
    nil
  end
end