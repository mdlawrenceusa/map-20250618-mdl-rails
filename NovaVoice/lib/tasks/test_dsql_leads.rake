namespace :aurora do
  desc "Test Aurora DSQL leads query"
  task test_leads: :environment do
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
    
    puts "Testing Aurora DSQL leads access..."
    
    # Query leads
    result = connection.exec("SELECT * FROM leads ORDER BY id")
    
    puts "\nLeads in Aurora DSQL:"
    puts "-" * 80
    result.each do |row|
      puts "ID: #{row['id']}"
      puts "Name: #{row['name']}"
      puts "Phone: #{row['phone']}"
      puts "Company: #{row['company']}"
      puts "Status: #{row['lead_status']}"
      puts "-" * 80
    end
    
    puts "\nTotal leads: #{result.ntuples}"
    
    connection.close
  end
end