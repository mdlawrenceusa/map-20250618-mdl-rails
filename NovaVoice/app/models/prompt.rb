class Prompt < ApplicationRecord
  belongs_to :lead, optional: true
  
  # Aurora DSQL compatibility - alias for column name differences
  alias_attribute :active, :is_active

  # Enums for prompt types
  PROMPT_TYPES = {
    system: 'system',
    greeting: 'greeting',
    scheduling: 'scheduling',
    objection_handling: 'objection_handling',
    closing: 'closing',
    custom: 'custom'
  }.freeze

  # Validations
  validates :name, presence: true
  validates :content, presence: true
  validates :version, presence: true, numericality: { greater_than: 0 }
  validates :prompt_type, presence: true, inclusion: { in: PROMPT_TYPES.values }
  validates :name, uniqueness: { scope: :version }

  # Scopes
  scope :active, -> { where(active: true) }
  scope :by_type, ->(type) { where(prompt_type: type) }
  scope :for_campaign, ->(campaign_id) { where(campaign_id: campaign_id) }
  scope :for_lead, ->(lead_id) { where(lead_id: lead_id) }
  scope :global, -> { where(lead_id: nil, campaign_id: nil) }
  scope :published, -> { where.not(published_at: nil) }
  scope :pending_publication, -> { 
    where(is_active: true).where(
      'updated_at > published_at OR published_at IS NULL'
    )
  }
  scope :by_assistant, ->(assistant_name) { where(assistant_name: assistant_name) }

  # Callbacks
  before_create :set_version_number
  after_save :deactivate_previous_versions, if: :saved_change_to_is_active?
  after_save :clear_cache
  after_destroy :clear_cache

  # Serialize metadata as JSON
  serialize :metadata, coder: JSON

  # Class methods
  def self.current_prompt(type:, lead_id: nil, campaign_id: nil)
    # Priority: lead-specific > campaign-specific > global
    prompt = nil
    
    if lead_id
      prompt = active.by_type(type).for_lead(lead_id).order(created_at: :desc).first
    end
    
    if prompt.nil? && campaign_id
      prompt = active.by_type(type).for_campaign(campaign_id).where(lead_id: nil).order(created_at: :desc).first
    end
    
    if prompt.nil?
      prompt = active.by_type(type).global.order(created_at: :desc).first
    end
    
    prompt
  end

  def self.create_new_version!(attributes)
    existing = where(name: attributes[:name]).order(version: :desc).first
    new_version = existing ? existing.version + 1 : 1
    
    create!(attributes.merge(version: new_version, is_active: true))
  end

  # Instance methods
  def activate!
    update!(is_active: true)
  end

  def deactivate!
    update!(is_active: false)
  end

  def duplicate_as_new_version
    self.class.create_new_version!(
      name: name,
      content: content,
      prompt_type: prompt_type,
      metadata: metadata,
      lead_id: lead_id,
      campaign_id: campaign_id
    )
  end

  def render_content(variables = {})
    content.gsub(/\{\{(\w+)\}\}/) do |match|
      key = $1.to_sym
      variables[key] || match
    end
  end

  # Publish status methods
  def published?
    published_at.present? && published_at >= updated_at
  end

  def pending_changes?
    !published? && is_active?
  end

  def content_changed_since_publish?
    published_content != content
  end

  def never_published?
    published_at.nil?
  end

  def publish_status
    if never_published?
      'never_published'
    elsif pending_changes?
      'pending_changes'
    else
      'published'
    end
  end

  def publish_status_label
    case publish_status
    when 'never_published'
      '📝 Never Published'
    when 'pending_changes'
      '⏳ Pending Changes'
    when 'published'
      '🚀 Published'
    end
  end

  private

  def set_version_number
    return if version.present?
    
    max_version = self.class.where(name: name).maximum(:version) || 0
    self.version = max_version + 1
  end

  def deactivate_previous_versions
    return unless is_active?
    
    self.class
      .where(name: name, prompt_type: prompt_type)
      .where.not(id: id)
      .update_all(is_active: false)
  end

  def clear_cache
    PromptCacheService.clear_prompt_cache(
      type: prompt_type,
      lead_id: lead_id,
      campaign_id: campaign_id
    )
    
    # Also clear global cache if this is a specific prompt
    if lead_id.present? || campaign_id.present?
      PromptCacheService.clear_prompt_cache(type: prompt_type)
    end
  end
end
