namespace :aurora do
  desc "Import sample leads to Aurora DSQL"
  task import_leads: :environment do
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
    
    puts "Importing sample leads to Aurora DSQL..."
    
    # Sample leads
    leads = [
      {
        id: 1,
        name: 'Pastor John Smith',
        phone: '+1 (555) 123-4567',
        email: 'john.smith@firstchurch.org',
        company: 'First Baptist Church',
        state_province: 'TX',
        lead_source: 'web',
        lead_status: 'Open - Not Contacted',
        call_status: 'not_called',
        calling_schedule_enabled: true
      },
      {
        id: 2,
        name: 'Pastor Sarah Johnson',
        phone: '+1 (555) 234-5678',
        email: 'sarah@gracechurch.org',
        company: 'Grace Community Church',
        state_province: 'CA',
        lead_source: 'referral',
        lead_status: 'Open - Not Contacted',
        call_status: 'not_called',
        calling_schedule_enabled: true
      },
      {
        id: 3,
        name: 'Pastor Michael Chen',
        phone: '+1 (555) 345-6789',
        email: 'mchen@hopechurch.org',
        company: 'Hope Fellowship Church',
        state_province: 'NY',
        lead_source: 'conference',
        lead_status: 'Open - Not Contacted',
        call_status: 'not_called',
        calling_schedule_enabled: true
      }
    ]
    
    leads.each do |lead|
      begin
        connection.exec_params(
          "INSERT INTO leads (id, name, phone, email, company, state_province, lead_source, lead_status, call_status, calling_schedule_enabled, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET updated_at = $12",
          [
            lead[:id],
            lead[:name],
            lead[:phone],
            lead[:email],
            lead[:company],
            lead[:state_province],
            lead[:lead_source],
            lead[:lead_status],
            lead[:call_status],
            lead[:calling_schedule_enabled],
            Time.now,
            Time.now
          ]
        )
        puts "✓ Imported lead: #{lead[:name]}"
      rescue => e
        puts "✗ Error importing lead #{lead[:name]}: #{e.message}"
      end
    end
    
    # Check results
    result = connection.exec("SELECT COUNT(*) FROM leads")
    count = result.getvalue(0, 0)
    puts "\nTotal leads in Aurora DSQL: #{count}"
    
    connection.close
  end
end