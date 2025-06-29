namespace :aurora do
  desc "Manually create Aurora DSQL schema and import data"
  task manual_setup: :environment do
    puts "Setting up Aurora DSQL manually..."
    
    hostname = 'lyabugbxayepatoxdewlxwdo7q.dsql.us-east-1.on.aws'
    region = 'us-east-1'
    
    # Generate auth token
    auth_token = `aws dsql generate-db-connect-admin-auth-token --hostname #{hostname} --region #{region}`.strip
    
    require 'pg'
    
    connection = PG.connect(
      host: hostname,
      port: 5432,
      dbname: 'postgres',
      user: 'admin',
      password: auth_token,
      sslmode: 'require'
    )
    
    puts "✓ Connected to Aurora DSQL"
    
    # Create schema manually based on Rails migrations
    schema_sql = <<~SQL
      -- Create schema_migrations table
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version character varying NOT NULL,
        PRIMARY KEY (version)
      );
      
      -- Create ar_internal_metadata table  
      CREATE TABLE IF NOT EXISTS ar_internal_metadata (
        key character varying NOT NULL,
        value character varying,
        created_at timestamp(6) NOT NULL,
        updated_at timestamp(6) NOT NULL,
        PRIMARY KEY (key)
      );
      
      -- Create campaigns table
      CREATE TABLE IF NOT EXISTS campaigns (
        id bigserial PRIMARY KEY,
        name character varying NOT NULL,
        description text,
        status character varying DEFAULT 'draft',
        batch_size integer DEFAULT 10,
        created_at timestamp(6) NOT NULL,
        updated_at timestamp(6) NOT NULL
      );
      
      -- Create leads table
      CREATE TABLE IF NOT EXISTS leads (
        id bigserial PRIMARY KEY,
        name character varying,
        phone character varying,
        email character varying,
        company character varying,
        website character varying,
        state_province character varying,
        lead_source character varying,
        lead_status character varying,
        created_date timestamp,
        owner_alias character varying,
        unread_by_owner boolean DEFAULT false,
        call_transcript text,
        last_call_date timestamp,
        call_status character varying DEFAULT 'not_called',
        calling_schedule_enabled boolean DEFAULT false,
        created_at timestamp(6) NOT NULL,
        updated_at timestamp(6) NOT NULL
      );
      
      -- Create prompts table
      CREATE TABLE IF NOT EXISTS prompts (
        id bigserial PRIMARY KEY,
        name character varying NOT NULL,
        content text NOT NULL,
        prompt_type character varying NOT NULL,
        active boolean DEFAULT true,
        lead_id bigint,
        campaign_id bigint,
        version integer DEFAULT 1,
        created_at timestamp(6) NOT NULL,
        updated_at timestamp(6) NOT NULL
      );
      
      -- Create calling_schedules table
      CREATE TABLE IF NOT EXISTS calling_schedules (
        id bigserial PRIMARY KEY,
        lead_id bigint NOT NULL,
        campaign_id bigint,
        scheduled_at timestamp NOT NULL,
        status character varying DEFAULT 'pending',
        attempts integer DEFAULT 0,
        last_attempt_at timestamp,
        completed_at timestamp,
        call_duration integer,
        call_result character varying,
        notes text,
        priority integer DEFAULT 5,
        created_at timestamp(6) NOT NULL,
        updated_at timestamp(6) NOT NULL
      );
      
      -- Create campaign_leads table
      CREATE TABLE IF NOT EXISTS campaign_leads (
        id bigserial PRIMARY KEY,
        campaign_id bigint NOT NULL,
        lead_id bigint NOT NULL,
        added_at timestamp DEFAULT CURRENT_TIMESTAMP,
        created_at timestamp(6) NOT NULL,
        updated_at timestamp(6) NOT NULL
      );
      
      -- Insert initial schema migration records
      INSERT INTO schema_migrations (version) VALUES 
        ('20241218051735'),
        ('20241218051736'),
        ('20241218051737'),
        ('20241218051738'),
        ('20241218051739')
      ON CONFLICT (version) DO NOTHING;
      
      -- Insert ar_internal_metadata
      INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES 
        ('environment', 'production', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP;
    SQL
    
    puts "Creating schema..."
    
    # Execute each DDL statement separately for Aurora DSQL
    # Use simple bigint columns since Aurora DSQL has limitations
    schema_statements = [
      "CREATE TABLE IF NOT EXISTS campaigns (id bigint NOT NULL, name character varying NOT NULL, description text, status character varying DEFAULT 'draft', batch_size integer DEFAULT 10, created_at timestamp(6) NOT NULL, updated_at timestamp(6) NOT NULL, PRIMARY KEY (id))",
      
      "CREATE TABLE IF NOT EXISTS leads (id bigint NOT NULL, name character varying, phone character varying, email character varying, company character varying, website character varying, state_province character varying, lead_source character varying, lead_status character varying, created_date timestamp, owner_alias character varying, unread_by_owner boolean DEFAULT false, call_transcript text, last_call_date timestamp, call_status character varying DEFAULT 'not_called', calling_schedule_enabled boolean DEFAULT false, created_at timestamp(6) NOT NULL, updated_at timestamp(6) NOT NULL, PRIMARY KEY (id))",
      
      "CREATE TABLE IF NOT EXISTS prompts (id bigint NOT NULL, name character varying NOT NULL, content text NOT NULL, prompt_type character varying NOT NULL, active boolean DEFAULT true, lead_id bigint, campaign_id bigint, version integer DEFAULT 1, created_at timestamp(6) NOT NULL, updated_at timestamp(6) NOT NULL, PRIMARY KEY (id))",
      
      "CREATE TABLE IF NOT EXISTS calling_schedules (id bigint NOT NULL, lead_id bigint NOT NULL, campaign_id bigint, scheduled_at timestamp NOT NULL, status character varying DEFAULT 'pending', attempts integer DEFAULT 0, last_attempt_at timestamp, completed_at timestamp, call_duration integer, call_result character varying, notes text, priority integer DEFAULT 5, created_at timestamp(6) NOT NULL, updated_at timestamp(6) NOT NULL, PRIMARY KEY (id))",
      
      "CREATE TABLE IF NOT EXISTS campaign_leads (id bigint NOT NULL, campaign_id bigint NOT NULL, lead_id bigint NOT NULL, added_at timestamp DEFAULT CURRENT_TIMESTAMP, created_at timestamp(6) NOT NULL, updated_at timestamp(6) NOT NULL, PRIMARY KEY (id))"
    ]
    
    schema_statements.each_with_index do |stmt, i|
      puts "  Creating table #{i+1}/#{schema_statements.length}..."
      connection.exec(stmt)
    end
    
    # Insert migration records
    puts "  Adding migration records..."
    migration_inserts = [
      "INSERT INTO schema_migrations (version) VALUES ('20241218051735') ON CONFLICT (version) DO NOTHING",
      "INSERT INTO schema_migrations (version) VALUES ('20241218051736') ON CONFLICT (version) DO NOTHING", 
      "INSERT INTO schema_migrations (version) VALUES ('20241218051737') ON CONFLICT (version) DO NOTHING",
      "INSERT INTO schema_migrations (version) VALUES ('20241218051738') ON CONFLICT (version) DO NOTHING",
      "INSERT INTO schema_migrations (version) VALUES ('20241218051739') ON CONFLICT (version) DO NOTHING",
      "INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', 'production', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP"
    ]
    
    migration_inserts.each do |stmt|
      connection.exec(stmt)
    end
    
    puts "✓ Schema created successfully"
    
    connection.close
    puts "✓ Aurora DSQL setup complete"
  end
  
  desc "Import data to Aurora DSQL"
  task import_data: :environment do
    puts "Importing data to Aurora DSQL..."
    
    hostname = 'lyabugbxayepatoxdewlxwdo7q.dsql.us-east-1.on.aws'
    region = 'us-east-1'
    
    # Generate auth token
    auth_token = `aws dsql generate-db-connect-admin-auth-token --hostname #{hostname} --region #{region}`.strip
    
    require 'pg'
    
    connection = PG.connect(
      host: hostname,
      port: 5432,
      dbname: 'postgres',
      user: 'admin',
      password: auth_token,
      sslmode: 'require'
    )
    
    export_dir = Rails.root.join('db/aurora_export')
    
    # Import in correct order
    ['campaigns', 'leads', 'prompts', 'calling_schedules'].each do |table|
      sql_file = export_dir.join("#{table}.sql")
      next unless File.exist?(sql_file)
      
      puts "Importing #{table}..."
      
      sql_content = File.read(sql_file)
      connection.exec(sql_content)
      puts "✓ Imported #{table}"
    end
    
    connection.close
    puts "✓ Data import complete"
  end
end