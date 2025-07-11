class Api::V1::TranscriptsController < Api::V1::BaseController
  skip_before_action :set_default_format, only: [:index]

  def index
    @transcript_service = TranscriptService.new
    # Get ALL calls for DataTables sorting/filtering
    @calls = @transcript_service.get_all_calls
    @stats = @transcript_service.get_call_stats
    
    respond_to do |format|
      format.html { render 'api/v1/transcripts/index', layout: false }
      format.json { 
        render json: {
          calls: @calls,
          stats: @stats,
          total: @calls.length
        }
      }
    end
  end

  def show
    @transcript_service = TranscriptService.new
    @call = @transcript_service.get_call(params[:id])
    
    if @call
      respond_to do |format|
        format.html { render 'api/v1/transcripts/show', layout: false }
        format.json { render json: { call: @call } }
      end
    else
      respond_to do |format|
        format.html { redirect_to api_v1_transcripts_path, alert: 'Call not found' }
        format.json { render json: { error: 'Call not found' }, status: :not_found }
      end
    end
  end

  def search
    @transcript_service = TranscriptService.new
    @calls = @transcript_service.search_calls(
      query: params[:query],
      phone_number: params[:phone_number],
      limit: params[:limit]&.to_i || 50
    )
    @stats = @transcript_service.get_call_stats
    
    respond_to do |format|
      format.html { render 'api/v1/transcripts/index', layout: false }
      format.json { 
        render json: {
          calls: @calls,
          stats: @stats,
          total: @calls.length,
          search_params: {
            query: params[:query],
            phone_number: params[:phone_number]
          }
        }
      }
    end
  end

  def stats
    @transcript_service = TranscriptService.new
    @stats = @transcript_service.get_call_stats
    
    render json: { stats: @stats }
  end
end