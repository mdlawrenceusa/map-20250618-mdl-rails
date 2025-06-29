namespace :aurora do
  desc "Test Aurora DSQL connection with direct auth token"
  task test_direct: :environment do
    puts "Testing Aurora DSQL connection with IAM auth..."
    
    hostname = 'lyabugbxayepatoxdewlxwdo7q.dsql.us-east-1.on.aws'
    region = 'us-east-1'
    
    # Generate auth token using AWS CLI
    auth_token = `aws dsql generate-db-connect-admin-auth-token --hostname #{hostname} --region #{region}`.strip
    
    puts "Generated auth token: #{auth_token[0..50]}..."
    
    begin
      require 'pg'
      
      # Test connection with pg gem directly
      connection = PG.connect(
        host: hostname,
        port: 5432,
        dbname: 'postgres',
        user: 'admin',
        password: auth_token,
        sslmode: 'require'
      )
      
      # Test query
      result = connection.exec("SELECT version();")
      puts "✓ Successfully connected to Aurora DSQL!"
      puts "Version: #{result.getvalue(0, 0)}"
      
      # Test database creation
      begin
        connection.exec("CREATE DATABASE novavoice_production;")
        puts "✓ Created novavoice_production database"
      rescue PG::DuplicateDatabase
        puts "✓ Database novavoice_production already exists"
      end
      
      connection.close
      
    rescue => e
      puts "✗ Connection failed: #{e.message}"
      puts "Full error: #{e.class}: #{e.message}"
    end
  end
end