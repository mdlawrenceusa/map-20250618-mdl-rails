class Campaign < ApplicationRecord
  has_many :campaign_calls, dependent: :destroy
  has_many :leads, through: :campaign_calls
  
  validates :name, presence: true
  validates :batch_size, presence: true, numericality: { greater_than: 0, less_than_or_equal_to: 100 }
  validates :call_spacing_seconds, presence: true, numericality: { greater_than: 0 }
  validates :status, inclusion: { in: %w[draft scheduled running paused completed] }
  
  scope :active, -> { where(status: %w[scheduled running]) }
  scope :by_status, ->(status) { where(status: status) }
  
  def launch_calls!(lead_criteria = {})
    return false unless status == 'draft'
    
    # Get leads matching criteria
    leads_to_call = Lead.where(lead_criteria)
                       .where.not(phone: [nil, ''])
                       .limit(batch_size)
    
    if leads_to_call.empty?
      return false
    end
    
    # Update campaign status
    update!(status: 'scheduled')
    
    # Publish to EventBridge
    publisher = EventBridgePublisher.new
    publisher.publish_campaign_launch(self, leads_to_call)
    
    true
  end
  
  def pause!
    update!(status: 'paused')
  end
  
  def resume!
    update!(status: 'running') if status == 'paused'
  end
  
  def complete!
    update!(status: 'completed')
  end
  
  def progress_summary
    {
      total_calls: campaign_calls.count,
      completed: campaign_calls.where(status: 'completed').count,
      failed: campaign_calls.where(status: 'failed').count,
      pending: campaign_calls.where(status: 'scheduled').count
    }
  end
end
