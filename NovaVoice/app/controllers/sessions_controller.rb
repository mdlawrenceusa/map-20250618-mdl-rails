class SessionsController < ApplicationController
  skip_before_action :authenticate_user!, only: [:new, :create]
  
  def new
    # Show login form
  end

  def create
    email = params[:email]
    password = params[:password]

    if email.blank? || password.blank?
      flash[:alert] = 'Please enter both email and password'
      render :new and return
    end

    auth_service = CognitoAuthService.new
    result = auth_service.authenticate(email, password)

    if result[:success]
      # Store authentication info in session
      session[:access_token] = result[:access_token]
      session[:refresh_token] = result[:refresh_token]
      session[:user_email] = result[:user][:email]
      session[:user_sub] = result[:user][:sub]
      session[:expires_at] = Time.current + result[:expires_in].seconds

      flash[:notice] = 'Successfully signed in!'
      redirect_to after_sign_in_path
    else
      flash[:alert] = result[:error]
      render :new
    end
  end

  def destroy
    session.clear
    flash[:notice] = 'Successfully signed out!'
    redirect_to new_session_path
  end

  private

  def after_sign_in_path
    # Redirect to prompts admin or root path
    stored_location_for_user || (request.path.start_with?('/app') ? '/app/api/v1/prompts/admin' : '/api/v1/prompts/admin') || root_path
  end

  def stored_location_for_user
    session.delete(:user_return_to)
  end
end