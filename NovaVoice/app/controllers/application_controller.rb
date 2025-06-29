class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern
  
  before_action :authenticate_user!
  
  protected
  
  def authenticate_user!
    return if authenticated?
    
    # Store the attempted URL
    session[:user_return_to] = request.fullpath if request.get?
    
    redirect_to new_session_path, alert: 'Please sign in to continue'
  end
  
  def authenticated?
    return false unless session[:access_token] && session[:expires_at]
    return false if Time.current > session[:expires_at]
    
    # Optionally verify token with Cognito (cached for performance)
    true
  end
  
  def current_user
    return nil unless authenticated?
    
    @current_user ||= {
      email: session[:user_email],
      sub: session[:user_sub]
    }
  end
  
  helper_method :current_user, :authenticated?
end
