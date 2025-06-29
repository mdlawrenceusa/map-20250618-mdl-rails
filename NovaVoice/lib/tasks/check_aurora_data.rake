namespace :aurora do
  desc "Check data in Aurora DSQL"
  task check_data: :environment do
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
    
    puts "Checking Aurora DSQL data..."
    
    tables = ['campaigns', 'leads', 'prompts', 'calling_schedules']
    
    tables.each do |table|
      result = connection.exec("SELECT COUNT(*) FROM #{table}")
      count = result.getvalue(0, 0)
      puts "#{table}: #{count} records"
    end
    
    # Check some prompts
    puts "\nSample prompts:"
    result = connection.exec("SELECT id, name, prompt_type, active FROM prompts LIMIT 5")
    result.each do |row|
      puts "  ID: #{row['id']}, Name: #{row['name']}, Type: #{row['prompt_type']}, Active: #{row['active']}"
    end
    
    connection.close
  end
end