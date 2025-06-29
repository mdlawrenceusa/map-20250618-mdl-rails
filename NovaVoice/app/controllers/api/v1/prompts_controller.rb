class Api::V1::PromptsController < Api::V1::BaseController
  skip_before_action :set_default_format, only: [:admin]
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
    # Aurora DSQL workaround - use raw SQL
    if Rails.env.production? && ActiveRecord::Base.connection.adapter_name == "PostgreSQL" && false # Disabled for now
      sql = "SELECT * FROM prompts"
      conditions = []
      
      conditions << "active = true" if params[:active] == 'true'
      conditions << "prompt_type = '#{params[:type]}'" if params[:type].present?
      conditions << "campaign_id = #{params[:campaign_id]}" if params[:campaign_id].present?
      conditions << "lead_id = #{params[:lead_id]}" if params[:lead_id].present?
      
      sql += " WHERE #{conditions.join(' AND ')}" if conditions.any?
      sql += " ORDER BY created_at DESC"
      
      results = ActiveRecord::Base.connection.execute(sql)
      prompts_data = results.map do |row|
        {
          id: row['id'],
          name: row['name'],
          content: row['content'],
          prompt_type: row['prompt_type'],
          active: row['active'] == 't',
          version: row['version'],
          created_at: row['created_at'],
          updated_at: row['updated_at']
        }
      end
      
      render json: {
        prompts: prompts_data,
        total: prompts_data.length
      }
    else
      # Original ActiveRecord implementation
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
  end

  # POST /api/v1/prompts
  def create
    prompt = Prompt.create_new_version!(prompt_params)
    render json: prompt_response(prompt), status: :created
  rescue ActiveRecord::RecordInvalid => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  # PATCH/PUT /api/v1/prompts/:id
  def update
    prompt = Prompt.find(params[:id])
    if prompt.update(prompt_params)
      render json: prompt_response(prompt)
    else
      render json: { errors: prompt.errors.full_messages }, status: :unprocessable_entity
    end
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
    @prompts = Prompt.includes(:lead).order(created_at: :desc)
    @pending_count = Prompt.pending_publication.count rescue 0
    @last_published = Prompt.published.maximum(:published_at) rescue nil
    
    respond_to do |format|
      format.html { render 'api/v1/prompts/admin', layout: 'application' }
      format.json { render json: { error: 'Please access this page in a web browser' }, status: :not_acceptable }
    end
  end

  # GET /api/v1/prompts/publish_status
  def publish_status
    # Stateless: Always show all active prompts as publishable
    active_prompts = Prompt.where(active: true).includes(:lead)
    active_count = active_prompts.count
    last_publish = Prompt.maximum(:published_at)
    
    # Get S3 status
    publish_service = PromptPublishService.new
    s3_status = publish_service.check_s3_status
    
    render json: {
      has_pending_changes: active_count > 0,
      pending_count: active_count,
      pending_prompts: active_prompts.map { |p| prompt_summary(p) },
      last_published_at: last_publish,
      can_publish: active_count > 0,
      s3_status: s3_status
    }
  end

  # POST /api/v1/prompts/publish
  def publish
    publish_service = PromptPublishService.new
    result = publish_service.publish_pending_changes
    
    if result[:success]
      render json: {
        success: true,
        message: result[:message],
        published_count: result[:published_count],
        published_assistants: result[:published_assistants]
      }
    else
      render json: {
        success: false,
        message: result[:message],
        errors: result[:errors]
      }, status: :unprocessable_entity
    end
  end

  # GET /api/v1/prompts/s3_status
  def s3_status
    publish_service = PromptPublishService.new
    status = publish_service.check_s3_status
    
    render json: status
  end

  # GET /api/v1/prompts/:assistant_name/published
  def show_published
    assistant_name = params[:assistant_name] || 'esther'
    publish_service = PromptPublishService.new
    result = publish_service.get_published_prompt(assistant_name)
    
    if result[:success]
      render json: {
        success: true,
        assistant_name: assistant_name,
        content: result[:content],
        last_modified: result[:last_modified],
        metadata: result[:metadata]
      }
    else
      render json: {
        success: false,
        error: result[:error]
      }, status: :not_found
    end
  end

  private

  def set_prompt
    @prompt = Prompt.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Prompt not found' }, status: :not_found
  end

  def prompt_params
    params.require(:prompt).permit(
      :name, :content, :prompt_type, :assistant_name, :lead_id, :campaign_id, metadata: {}
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
      assistant_name: prompt.assistant_name,
      metadata: prompt.metadata || {},
      created_at: prompt.created_at,
      updated_at: prompt.updated_at,
      published_at: prompt.published_at,
      publish_status: prompt.publish_status,
      publish_status_label: prompt.publish_status_label
    }
  end

  def prompt_summary(prompt)
    {
      id: prompt.id,
      name: prompt.name,
      prompt_type: prompt.prompt_type,
      assistant_name: prompt.assistant_name,
      publish_status: prompt.publish_status
    }
  end
end
