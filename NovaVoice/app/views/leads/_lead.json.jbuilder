json.extract! lead, :id, :name, :company, :phone, :website, :state_province, :lead_source, :email, :lead_status, :created_date, :owner_alias, :unread_by_owner, :created_at, :updated_at
json.url lead_url(lead, format: :json)
