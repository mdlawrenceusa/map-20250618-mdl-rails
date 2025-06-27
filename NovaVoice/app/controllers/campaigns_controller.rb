class CampaignsController < ApplicationController
  before_action :set_campaign, only: [:show, :edit, :update, :destroy, :launch, :pause, :resume]

  def index
    @campaigns = Campaign.includes(:campaign_calls).order(created_at: :desc)
    @total_leads = Lead.count
    @callable_leads = Lead.where.not(phone: [nil, '']).count
  end

  def show
    @progress = @campaign.progress_summary
    @recent_calls = @campaign.campaign_calls
                             .includes(:lead)
                             .order(created_at: :desc)
                             .limit(20)
  end

  def new
    @campaign = Campaign.new(
      batch_size: 25,
      call_spacing_seconds: 30,
      status: 'draft',
      created_by: 'admin' # TODO: Replace with current_user when auth is added
    )
  end

  def create
    @campaign = Campaign.new(campaign_params)
    @campaign.created_by = 'admin' # TODO: Replace with current_user
    
    if @campaign.save
      redirect_to @campaign, notice: 'Campaign was successfully created.'
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
  end

  def update
    if @campaign.update(campaign_params)
      redirect_to @campaign, notice: 'Campaign was successfully updated.'
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @campaign.destroy!
    redirect_to campaigns_path, notice: 'Campaign was successfully deleted.'
  end

  def launch
    # Get lead criteria from params
    lead_criteria = build_lead_criteria
    
    if @campaign.launch_calls!(lead_criteria)
      redirect_to @campaign, notice: "Campaign launched! #{@campaign.batch_size} calls scheduled."
    else
      redirect_to @campaign, alert: 'Failed to launch campaign. Check lead criteria and try again.'
    end
  rescue StandardError => e
    Rails.logger.error "Campaign launch failed: #{e.message}"
    redirect_to @campaign, alert: "Campaign launch failed: #{e.message}"
  end

  def pause
    @campaign.pause!
    redirect_to @campaign, notice: 'Campaign paused.'
  end

  def resume
    @campaign.resume!
    redirect_to @campaign, notice: 'Campaign resumed.'
  end

  private

  def set_campaign
    @campaign = Campaign.find(params[:id])
  end

  def campaign_params
    params.require(:campaign).permit(
      :name, 
      :description, 
      :batch_size, 
      :call_spacing_seconds, 
      :prompt_override
    )
  end

  def build_lead_criteria
    criteria = {}
    
    # Filter by status if specified
    if params[:lead_status].present?
      criteria[:lead_status] = params[:lead_status]
    end
    
    # Filter by state if specified
    if params[:state_province].present?
      criteria[:state_province] = params[:state_province]
    end
    
    # Filter by lead source if specified
    if params[:lead_source].present?
      criteria[:lead_source] = params[:lead_source]
    end
    
    # Exclude leads already in active campaigns
    active_campaign_lead_ids = CampaignCall.joins(:campaign)
                                          .where(campaigns: { status: %w[scheduled running] })
                                          .pluck(:lead_id)
    
    if active_campaign_lead_ids.any?
      criteria[:id] = Lead.where.not(id: active_campaign_lead_ids)
    end
    
    criteria
  end
end
