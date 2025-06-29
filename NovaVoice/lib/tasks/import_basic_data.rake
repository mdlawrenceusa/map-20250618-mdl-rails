namespace :aurora do
  desc "Import basic data to Aurora DSQL"
  task import_basic: :environment do
    require 'pg'
    
    hostname = 'lyabugbxayepatoxdewlxwdo7q.dsql.us-east-1.on.aws'
    auth_token = `aws dsql generate-db-connect-admin-auth-token --hostname #{hostname} --region us-east-1`.strip
    
    connection = PG.connect(
      host: hostname,
      port: 5432,
      dbname: 'postgres',
      user: 'admin',
      password: auth_token,
      sslmode: 'require'
    )
    
    puts "Importing basic data to Aurora DSQL..."
    
    # Import some sample campaigns
    puts "Importing campaigns..."
    campaigns = [
      [1, 'Initial Outreach', 'First contact campaign for senior pastors', 'active', 10, Time.now, Time.now],
      [2, 'Holiday Outreach', 'Christmas season special outreach', 'draft', 20, Time.now, Time.now]
    ]
    
    campaigns.each do |data|
      connection.exec_params(
        "INSERT INTO campaigns (id, name, description, status, batch_size, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
        data
      )
    end
    
    # Import essential prompts from SQLite
    puts "Importing prompts from SQLite..."
    prompts_to_import = []
    
    # Read from SQLite in development
    ActiveRecord::Base.configurations = Rails.application.config.database_configuration
    dev_config = ActiveRecord::Base.configurations.configs_for(env_name: 'development').first
    dev_connection = ActiveRecord::Base.establish_connection(dev_config.configuration_hash).connection
    
    result = dev_connection.execute("SELECT id, name, content, prompt_type, active, lead_id, campaign_id, version FROM prompts WHERE active = 1 OR name LIKE '%nova_sonic%' OR name LIKE '%system%' OR name LIKE '%greeting%'")
    
    result.each do |row|
      prompts_to_import << [
        row['id'],
        row['name'],
        row['content'] || 'Default content',
        row['prompt_type'] || 'system',
        row['active'] == 1,
        row['lead_id'],
        row['campaign_id'],
        row['version'] || 1,
        Time.now,
        Time.now
      ]
    end
    
    # Switch back to production
    prod_config = ActiveRecord::Base.configurations.configs_for(env_name: 'production').first
    ActiveRecord::Base.establish_connection(prod_config.configuration_hash)
    
    # Insert prompts into Aurora DSQL
    prompts_to_import.each do |data|
      begin
        connection.exec_params(
          "INSERT INTO prompts (id, name, content, prompt_type, active, lead_id, campaign_id, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING",
          data
        )
        puts "  Imported prompt: #{data[1]}"
      rescue => e
        puts "  Error importing prompt #{data[1]}: #{e.message}"
      end
    end
    
    connection.close
    puts "✓ Basic data import complete"
  end
end