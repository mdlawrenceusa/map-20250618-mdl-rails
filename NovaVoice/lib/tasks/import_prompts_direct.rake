namespace :aurora do
  desc "Import prompts directly to Aurora DSQL"
  task import_prompts: :environment do
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
    
    puts "Importing prompts to Aurora DSQL..."
    
    # Essential prompts for Nova Sonic
    prompts = [
      {
        id: 1,
        name: 'system_prompt',
        content: 'You are Esther, a warm and professional scheduling assistant for Mike Lawrence Productions. Your ONLY purpose is to schedule 15-minute web meetings between senior pastors and Mike Lawrence to discuss spreading the Gospel through modern outreach programs. Keep responses brief (under 25 words).',
        prompt_type: 'system',
        active: true
      },
      {
        id: 2,
        name: 'greeting_prompt',
        content: 'Hello! This is Esther from Mike Lawrence Productions. Is this Pastor {{pastor_name}}? I am calling to schedule a brief 15-minute meeting with Mike Lawrence.',
        prompt_type: 'greeting',
        active: true
      },
      {
        id: 3,
        name: 'scheduling_prompt',
        content: 'Great! Mike Lawrence would love to share how we can help spread the Gospel. He has openings {{alternative_slots}}. Which works best for you?',
        prompt_type: 'scheduling',
        active: true
      },
      {
        id: 4,
        name: 'objection_handling_prompt',
        content: 'I understand your time is valuable. This is just a brief 15-minute call to explore how we might serve your ministry. Would {{alternative_time}} work better?',
        prompt_type: 'objection_handling',
        active: true
      },
      {
        id: 5,
        name: 'closing_prompt',
        content: 'Perfect! I have scheduled your meeting with Mike Lawrence for {{meeting_time}}. You will receive a confirmation email shortly. God bless!',
        prompt_type: 'closing',
        active: true
      }
    ]
    
    prompts.each do |prompt|
      begin
        connection.exec_params(
          "INSERT INTO prompts (id, name, content, prompt_type, active, lead_id, campaign_id, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET content = $3, active = $5, updated_at = $10",
          [
            prompt[:id],
            prompt[:name],
            prompt[:content],
            prompt[:prompt_type],
            prompt[:active],
            nil, # lead_id
            nil, # campaign_id
            1,   # version
            Time.now,
            Time.now
          ]
        )
        puts "✓ Imported prompt: #{prompt[:name]}"
      rescue => e
        puts "✗ Error importing prompt #{prompt[:name]}: #{e.message}"
      end
    end
    
    # Check results
    result = connection.exec("SELECT COUNT(*) FROM prompts")
    count = result.getvalue(0, 0)
    puts "\nTotal prompts in Aurora DSQL: #{count}"
    
    connection.close
  end
end