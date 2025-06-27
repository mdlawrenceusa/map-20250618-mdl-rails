class CampaignCall < ApplicationRecord
  belongs_to :campaign
  belongs_to :lead
  
  validates :phone_number, presence: true
  validates :status, inclusion: { in: %w[scheduled initiated connected completed failed] }
  validates :attempt_number, presence: true, numericality: { greater_than: 0 }
  
  scope :pending, -> { where(status: 'scheduled') }
  scope :completed, -> { where(status: 'completed') }
  scope :failed, -> { where(status: 'failed') }
  
  def mark_initiated!(call_uuid)
    update!(
      status: 'initiated',
      call_uuid: call_uuid,
      called_at: Time.current
    )
  end
  
  def mark_completed!
    update!(status: 'completed')
  end
  
  def mark_failed!(error_msg = nil)
    update!(
      status: 'failed',
      error_message: error_msg
    )
  end
  
  def duration
    return nil unless called_at && status == 'completed'
    # We'll need to get this from transcript data
    "Unknown" # Placeholder
  end
end
