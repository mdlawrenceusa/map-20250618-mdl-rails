class Api::V1::PromptsController < Api::V1::BaseController
  before_action :set_prompt, only: [:show]

  # GET /api/v1/prompts/current
  # Fetches the current active prompt based on type and optional lead/campaign
  def current
    prompt_type = params[:type]
    lead_id = params[:lead_id]
    campaign_id = params[:campaign_id]

    unless prompt_type.present?
      return render json: { error: 'prompt_type parameter is required' }, status: :bad_request
    end

    # Use cached version for better performance
    prompt_data = PromptCacheService.fetch_prompt(
      type: prompt_type,
      lead_id: lead_id,
      campaign_id: campaign_id
    )

    if prompt_data
      render json: prompt_data
    else
      render json: { error: 'No active prompt found' }, status: :not_found
    end
  end

  # GET /api/v1/prompts/:id
  def show
    render json: prompt_response(@prompt)
  end

  # GET /api/v1/prompts
  # Lists prompts with optional filtering
  def index
    prompts = Prompt.all
    prompts = prompts.active if params[:active] == 'true'
    prompts = prompts.by_type(params[:type]) if params[:type].present?
    prompts = prompts.for_campaign(params[:campaign_id]) if params[:campaign_id].present?
    prompts = prompts.for_lead(params[:lead_id]) if params[:lead_id].present?
    prompts = prompts.order(created_at: :desc)

    render json: {
      prompts: prompts.map { |p| prompt_response(p) },
      total: prompts.count
    }
  end

  # POST /api/v1/prompts
  def create
    prompt = Prompt.create_new_version!(prompt_params)
    render json: prompt_response(prompt), status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  # PATCH/PUT /api/v1/prompts/:id/activate
  def activate
    prompt = Prompt.find(params[:id])
    prompt.activate!
    render json: prompt_response(prompt)
  end

  # PATCH/PUT /api/v1/prompts/:id/deactivate
  def deactivate
    prompt = Prompt.find(params[:id])
    prompt.deactivate!
    render json: prompt_response(prompt)
  end

  # POST /api/v1/prompts/:id/duplicate
  def duplicate
    prompt = Prompt.find(params[:id])
    new_prompt = prompt.duplicate_as_new_version
    render json: prompt_response(new_prompt), status: :created
  end

  # POST /api/v1/prompts/render
  # Renders a prompt with variables
  def render_prompt
    prompt_id = params[:prompt_id]
    variables = params[:variables] || {}

    prompt = Prompt.find(prompt_id)
    rendered_content = prompt.render_content(variables)

    render json: {
      prompt_id: prompt.id,
      rendered_content: rendered_content,
      original_content: prompt.content,
      variables: variables
    }
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Prompt not found' }, status: :not_found
  end

  # POST /api/v1/prompts/clear_cache
  def clear_cache
    PromptCacheService.clear_all_prompt_caches
    render json: { message: 'Cache cleared successfully' }
  end

  # GET /api/v1/prompts/admin
  def admin
    render 'api/v1/prompts/admin'
  end

  private

  def set_prompt
    @prompt = Prompt.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Prompt not found' }, status: :not_found
  end

  def prompt_params
    params.require(:prompt).permit(
      :name, :content, :prompt_type, :lead_id, :campaign_id, metadata: {}
    )
  end

  def prompt_response(prompt)
    {
      id: prompt.id,
      name: prompt.name,
      content: prompt.content,
      prompt_type: prompt.prompt_type,
      version: prompt.version,
      is_active: prompt.is_active,
      lead_id: prompt.lead_id,
      campaign_id: prompt.campaign_id,
      metadata: prompt.metadata || {},
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    }
  end
end
