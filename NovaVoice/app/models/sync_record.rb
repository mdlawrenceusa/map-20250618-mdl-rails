class SyncRecord < ApplicationRecord
  # Validations
  validates :resource_type, presence: true, inclusion: { 
    in: %w[prompt campaign lead call_transcript analytics] 
  }
  validates :resource_id, presence: true
  validates :synced_by, presence: true
  validates :synced_at, presence: true
  validates :environment, presence: true, inclusion: { 
    in: %w[dev_to_prod prod_to_dev] 
  }
  
  # Scopes
  scope :recent, -> { order(synced_at: :desc) }
  scope :by_type, ->(type) { where(resource_type: type) }
  scope :by_user, ->(user) { where(synced_by: user) }
  scope :today, -> { where(synced_at: Time.current.beginning_of_day..Time.current.end_of_day) }
  
  # Serialize sync details as JSON
  serialize :sync_details, coder: JSON
  
  # Class methods
  def self.record_sync(resource_type:, resource_id:, user:, environment:, details: {})
    create!(
      resource_type: resource_type,
      resource_id: resource_id,
      synced_by: user.respond_to?(:name) ? user.name : user.to_s,
      synced_at: Time.current,
      environment: environment,
      sync_details: details
    )
  end
  
  # Instance methods
  def resource
    case resource_type
    when 'prompt'
      Prompt.find_by(id: resource_id)
    when 'campaign'
      Campaign.find_by(id: resource_id)
    when 'lead'
      Lead.find_by(id: resource_id)
    else
      nil
    end
  end
  
  def description
    "#{resource_type.capitalize} ##{resource_id} synced #{environment.humanize} by #{synced_by}"
  end
end
