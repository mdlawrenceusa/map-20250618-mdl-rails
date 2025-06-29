class Admin::SyncController < ApplicationController
  before_action :require_admin!
  before_action :require_development!, only: [:sync_to_production]
  before_action :require_cognito_auth!, if: :production?
  
  def index
    @sync_history = SyncRecord.recent.limit(50)
    @pending_syncs = identify_pending_syncs
  end
  
  def status
    # Check Aurora DSQL connection status
    status = if defined?(ENV['AURORA_DSQL_ENDPOINT']) && ENV['AURORA_DSQL_ENDPOINT'].present?
      begin
        # In real implementation, would test Aurora DSQL connection
        # For now, return mock status
        { connected: false, message: "Aurora DSQL not configured" }
      rescue => e
        { connected: false, error: e.message }
      end
    else
      { connected: false, message: "Using SQLite for development" }
    end
    
    render json: status
  end
  
  def preview
    resource_type = params[:resource_type]
    resource_ids = params[:resource_ids]
    
    # For development, show a sample of available resources
    @preview_data = AuroraSyncService.preview_sync(resource_type, resource_ids)
    
    render json: @preview_data
  end
  
  def sync_to_production
    resource_type = params[:resource_type]
    resource_ids = params[:resource_ids]
    
    # Require confirmation
    unless params[:confirm] == "SYNC_TO_PRODUCTION"
      return render json: { 
        error: "Confirmation required. Set confirm=SYNC_TO_PRODUCTION" 
      }, status: :unprocessable_entity
    end
    
    begin
      results = AuroraSyncService.sync_to_production(
        resource_type, 
        resource_ids,
        user: current_user
      )
      
      render json: {
        success: true,
        synced_count: results.count,
        details: results
      }
    rescue => e
      render json: {
        success: false,
        error: e.message
      }, status: :unprocessable_entity
    end
  end
  
  def copy_from_production
    resource_type = params[:resource_type]
    resource_ids = params[:resource_ids]
    
    begin
      results = AuroraSyncService.copy_from_production(resource_type, resource_ids)
      
      render json: {
        success: true,
        copied_count: results.count,
        details: results
      }
    rescue => e
      render json: {
        success: false,
        error: e.message
      }, status: :unprocessable_entity
    end
  end
  
  private
  
  def require_admin!
    # In a real app, would check current_user&.admin?
    # For now, allow access in development
    unless Rails.env.development?
      redirect_to root_path, alert: "Admin access required"
    end
  end
  
  def current_user
    # Stub for development - in production would use real authentication
    OpenStruct.new(name: "Admin User", admin?: true)
  end
  
  def require_development!
    unless Rails.env.development?
      render json: { error: "This action is only available in development" }, 
             status: :forbidden
    end
  end
  
  def require_cognito_auth!
    # Verify Cognito authentication for production access
    authenticate_cognito_user!
  end
  
  def identify_pending_syncs
    # For development, just show recent items
    {
      prompts: Prompt.where("updated_at > ?", 1.day.ago).limit(5),
      campaigns: Campaign.where(status: 'draft').limit(5),
      leads: Lead.where("created_at > ?", 1.week.ago).limit(5)
    }
  end
end