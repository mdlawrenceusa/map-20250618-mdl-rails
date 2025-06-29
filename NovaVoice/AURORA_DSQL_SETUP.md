# Aurora DSQL Setup Guide for NovaVoice

This guide will help you set up Aurora Distributed SQL for production use with NovaVoice, enabling secure data synchronization between development and production environments.

## 🚀 Quick Overview

Aurora DSQL provides:
- **Multi-region active-active** database capability
- **PostgreSQL compatibility** for Rails
- **Strong consistency** across regions
- **Serverless scaling** with no infrastructure management

## 📋 Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI configured
3. PostgreSQL client tools installed

## 🛠️ Step 1: Create Aurora DSQL Cluster

### Using AWS Console:

1. Navigate to Amazon Aurora in AWS Console
2. Click "Create database"
3. Select "Aurora Distributed SQL (Preview)"
4. Configure:
   - **Cluster identifier**: `novavoice-dsql`
   - **Master username**: `admin`
   - **Master password**: Generate secure password
   - **Regions**: Select primary (us-east-1) and replica regions

### Using AWS CLI:

```bash
aws rds create-db-cluster \
  --db-cluster-identifier novavoice-dsql \
  --engine aurora-postgresql \
  --engine-mode serverless \
  --engine-version 15.4 \
  --master-username admin \
  --master-user-password <your-secure-password> \
  --enable-http-endpoint \
  --region us-east-1
```

## 🔐 Step 2: Configure Database Users and Schemas

Once the cluster is available, connect and set up the schema structure:

```sql
-- Connect to the database
psql -h <your-cluster-endpoint>.dsql.us-east-1.on.aws -U admin -d postgres

-- Create the NovaVoice database
CREATE DATABASE novavoice_shared;

-- Connect to the new database
\c novavoice_shared;

-- Create users
CREATE USER dev_user WITH PASSWORD 'dev_password_here';
CREATE USER prod_user WITH PASSWORD 'prod_password_here';
CREATE USER prod_reader WITH PASSWORD 'reader_password_here';

-- Create schemas
CREATE SCHEMA shared;
CREATE SCHEMA dev;
CREATE SCHEMA prod;

-- Grant permissions
GRANT USAGE ON SCHEMA shared TO dev_user, prod_user;
GRANT ALL ON SCHEMA dev TO dev_user;
GRANT ALL ON SCHEMA prod TO prod_user;

-- Cross-environment read permissions
GRANT USAGE ON SCHEMA prod TO dev_user;
GRANT SELECT ON ALL TABLES IN SCHEMA prod TO dev_user;
GRANT USAGE ON SCHEMA dev TO prod_user;
GRANT SELECT ON ALL TABLES IN SCHEMA dev TO prod_user;

-- Set default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA shared GRANT ALL ON TABLES TO dev_user, prod_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT ALL ON TABLES TO dev_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA prod GRANT ALL ON TABLES TO prod_user;
```

## 🔧 Step 3: Configure Rails Environments

### 1. Copy the example environment file:
```bash
cp .env.aurora.example .env.aurora
```

### 2. Update `.env.aurora` with your Aurora DSQL endpoints:
```bash
# Aurora DSQL Endpoints
AURORA_DSQL_ENDPOINT=novavoice-dsql.cluster-abc123.us-east-1.dsql.on.aws
AURORA_DSQL_READ_ENDPOINT=novavoice-dsql.cluster-ro-abc123.us-east-1.dsql.on.aws

# Database Credentials (use AWS Secrets Manager in production)
AURORA_DSQL_DEV_PASSWORD=your_dev_password
AURORA_DSQL_PROD_PASSWORD=your_prod_password
AURORA_DSQL_READ_PASSWORD=your_read_password
```

### 3. Update Rails database configuration:

For development (still using SQLite locally):
```yaml
# config/database.yml
development:
  <<: *default
  adapter: sqlite3
  database: storage/development.sqlite3
```

For production (using Aurora DSQL):
```yaml
# config/database.yml
production:
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  host: <%= ENV['AURORA_DSQL_ENDPOINT'] %>
  port: 5432
  database: novavoice_shared
  username: prod_user
  password: <%= ENV['AURORA_DSQL_PROD_PASSWORD'] %>
  schema_search_path: "prod,shared,public"
```

## 🚀 Step 4: Deploy Production Rails with Cognito

### 1. Set up AWS Cognito User Pool:

```bash
aws cognito-idp create-user-pool \
  --pool-name NovaVoiceUsers \
  --policies "PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true}" \
  --auto-verified-attributes email
```

### 2. Create Cognito App Client:

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id <your-user-pool-id> \
  --client-name NovaVoiceWebApp \
  --generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH
```

### 3. Deploy Production Container:

```yaml
# docker-compose.production.yml
version: '3.8'
services:
  rails_prod:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - RAILS_ENV=production
      - DATABASE_URL=postgresql://prod_user:${AURORA_DSQL_PROD_PASSWORD}@${AURORA_DSQL_ENDPOINT}/novavoice_shared
      - COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
      - COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
      - COGNITO_ENABLED=true
      - SECRET_KEY_BASE=${SECRET_KEY_BASE}
    ports:
      - "443:3000"
    volumes:
      - ./public/assets:/app/public/assets
    command: bundle exec puma -C config/puma.rb
```

## 📊 Step 5: Run Initial Data Migration

### 1. Export current SQLite data:

```bash
# Dump SQLite data to SQL
rails db:seed:dump
```

### 2. Import to Aurora DSQL shared schema:

```bash
# Connect to Aurora DSQL and import
psql -h $AURORA_DSQL_ENDPOINT -U admin -d novavoice_shared < db/data.sql
```

### 3. Verify data migration:

```ruby
# Rails console in production
rails c -e production
Lead.count  # Should match SQLite count
Prompt.count  # Should match SQLite count
```

## 🔄 Step 6: Test Sync Functionality

### 1. Access Sync Management UI:

Development: http://localhost:8080/admin/sync
Production: https://your-domain.com/admin/sync (requires Cognito login)

### 2. Test sync operations:

- **Dev → Prod**: Sync a test prompt
- **Prod → Dev**: Copy a call transcript
- Verify sync records are created

## 🎯 Step 7: Production Checklist

- [ ] Aurora DSQL cluster created and accessible
- [ ] Database schemas and users configured
- [ ] Rails production environment configured
- [ ] Cognito authentication enabled
- [ ] SSL certificate configured
- [ ] Environment variables set
- [ ] Initial data migration completed
- [ ] Sync functionality tested
- [ ] Monitoring and alerts configured

## 🚨 Troubleshooting

### Connection Issues:
```bash
# Test Aurora DSQL connection
psql -h $AURORA_DSQL_ENDPOINT -U admin -d novavoice_shared -c "SELECT 1"

# Check security groups
aws ec2 describe-security-groups --group-ids <your-sg-id>
```

### Schema Issues:
```sql
-- Check current schema
SHOW search_path;

-- List all schemas
\dn

-- Check permissions
\dp
```

### Sync Issues:
```ruby
# Rails console
SyncRecord.recent.each { |s| puts s.description }
```

## 💰 Cost Optimization

- Aurora DSQL charges per request, not per hour
- Use read replicas for heavy query operations
- Enable query caching in Rails
- Monitor with CloudWatch for optimization opportunities

## 🔗 Next Steps

1. Set up automated backups
2. Configure CloudWatch alarms
3. Implement Cognito MFA
4. Set up CI/CD pipeline for production deployments
5. Enable AWS X-Ray for performance monitoring

---

For questions or issues, consult the AWS Aurora DSQL documentation or file an issue in the NovaVoice repository.