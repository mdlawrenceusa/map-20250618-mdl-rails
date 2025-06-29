namespace :aurora do
  desc "Export data from SQLite to SQL files for Aurora DSQL import"
  task export: :environment do
    puts "Exporting data from SQLite..."
    
    # Create export directory
    export_dir = Rails.root.join('db/aurora_export')
    FileUtils.mkdir_p(export_dir)
    
    # Tables to export (in order to respect foreign key constraints)
    tables = %w[campaigns leads prompts calling_schedules campaign_leads]
    
    tables.each do |table|
      puts "Exporting #{table}..."
      
      # Get the model class
      model = table.classify.constantize rescue nil
      next unless model
      
      # Export to SQL file
      File.open(export_dir.join("#{table}.sql"), 'w') do |file|
        file.puts "-- Data export for #{table}"
        file.puts "DELETE FROM #{table};"
        file.puts ""
        
        model.find_each do |record|
          columns = record.attributes.keys
          values = record.attributes.values.map do |v|
            case v
            when nil
              'NULL'
            when String
              "'#{v.gsub("'", "''")}'"
            when Time, DateTime
              "'#{v.iso8601}'"
            else
              v
            end
          end
          
          file.puts "INSERT INTO #{table} (#{columns.join(', ')}) VALUES (#{values.join(', ')});"
        end
      end
    end
    
    puts "Export complete! Files saved to #{export_dir}"
  end
  
  desc "Import data to Aurora DSQL from SQL files"
  task import: :environment do
    puts "Importing data to Aurora DSQL..."
    
    export_dir = Rails.root.join('db/aurora_export')
    
    # Import in correct order
    tables = %w[campaigns leads prompts calling_schedules campaign_leads]
    
    tables.each do |table|
      sql_file = export_dir.join("#{table}.sql")
      next unless File.exist?(sql_file)
      
      puts "Importing #{table}..."
      
      ActiveRecord::Base.connection.execute(File.read(sql_file))
    end
    
    puts "Import complete!"
  end
  
  desc "Test Aurora DSQL connection"
  task test_connection: :environment do
    puts "Testing Aurora DSQL connection..."
    
    begin
      # This will use the database.yml configuration
      ActiveRecord::Base.connection.execute("SELECT version();")
      puts "✓ Successfully connected to Aurora DSQL!"
      
      # Show database info
      result = ActiveRecord::Base.connection.execute("SELECT current_database(), current_user, version();")
      result.each do |row|
        puts "Database: #{row['current_database']}"
        puts "User: #{row['current_user']}"
        puts "Version: #{row['version']}"
      end
    rescue => e
      puts "✗ Connection failed: #{e.message}"
    end
  end
end