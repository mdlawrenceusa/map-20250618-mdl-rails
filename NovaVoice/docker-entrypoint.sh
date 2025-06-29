#!/bin/bash
set -e

# NovaVoice Production Entrypoint Script

echo "🚀 Starting NovaVoice Rails application..."
echo "Environment: $RAILS_ENV"
echo "Ruby version: $(ruby --version)"
echo "Rails version: $(bundle exec rails --version)"

# Function to wait for database
wait_for_db() {
  echo "⏳ Waiting for database connection..."
  until bundle exec rails runner "ActiveRecord::Base.connection.verify!" >/dev/null 2>&1; do
    echo "Database not ready, waiting 5 seconds..."
    sleep 5
  done
  echo "✅ Database connection established"
}

# Function to run database migrations
run_migrations() {
  echo "🔄 Running database migrations..."
  bundle exec rails db:migrate
  echo "✅ Database migrations completed"
}

# Function to precompile assets if needed
precompile_assets() {
  if [[ ! -d "public/assets" ]] || [[ -z "$(ls -A public/assets)" ]]; then
    echo "🎨 Precompiling assets..."
    bundle exec rails assets:precompile
    echo "✅ Assets precompiled"
  else
    echo "✅ Assets already compiled"
  fi
}

# Function to create necessary directories
setup_directories() {
  echo "📁 Setting up directories..."
  mkdir -p tmp/pids tmp/cache tmp/sockets log storage
  echo "✅ Directories created"
}

# Function to cleanup old processes
cleanup_processes() {
  echo "🧹 Cleaning up old processes..."
  rm -f tmp/pids/server.pid
  echo "✅ Old processes cleaned up"
}

# Function to check environment variables
check_env_vars() {
  echo "🔍 Checking environment variables..."
  
  required_vars=(
    "SECRET_KEY_BASE"
    "DATABASE_URL"
  )
  
  for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
      echo "❌ ERROR: Required environment variable $var is not set"
      exit 1
    fi
  done
  
  if [[ "$COGNITO_ENABLED" == "true" ]]; then
    cognito_vars=(
      "COGNITO_USER_POOL_ID"
      "COGNITO_CLIENT_ID"
      "COGNITO_DOMAIN"
    )
    
    for var in "${cognito_vars[@]}"; do
      if [[ -z "${!var}" ]]; then
        echo "❌ ERROR: Cognito is enabled but $var is not set"
        exit 1
      fi
    done
  fi
  
  echo "✅ Environment variables validated"
}

# Function to check database connection
check_database() {
  echo "🔍 Checking database configuration..."
  
  if ! bundle exec rails runner "puts ActiveRecord::Base.connection.adapter_name" >/dev/null 2>&1; then
    echo "❌ ERROR: Cannot connect to database"
    echo "Database URL: ${DATABASE_URL}"
    exit 1
  fi
  
  echo "✅ Database connection verified"
}

# Function to run health checks
run_health_checks() {
  echo "🏥 Running health checks..."
  
  # Check if we can load the Rails environment
  if ! bundle exec rails runner "puts 'Rails environment loaded successfully'" >/dev/null 2>&1; then
    echo "❌ ERROR: Cannot load Rails environment"
    exit 1
  fi
  
  # Check if all models can be loaded
  if ! bundle exec rails runner "Rails.application.eager_load!" >/dev/null 2>&1; then
    echo "❌ ERROR: Cannot load all application models"
    exit 1
  fi
  
  echo "✅ Health checks passed"
}

# Main execution flow
main() {
  echo "================================================"
  echo "🎯 NovaVoice Production Deployment"
  echo "================================================"
  
  # Basic setup
  setup_directories
  cleanup_processes
  check_env_vars
  
  # Database operations
  if [[ "$SKIP_DB_SETUP" != "true" ]]; then
    wait_for_db
    check_database
    run_migrations
  else
    echo "⏭️  Skipping database setup (SKIP_DB_SETUP=true)"
  fi
  
  # Asset compilation
  if [[ "$SKIP_ASSETS" != "true" ]]; then
    precompile_assets
  else
    echo "⏭️  Skipping asset compilation (SKIP_ASSETS=true)"
  fi
  
  # Final health checks
  run_health_checks
  
  echo "================================================"
  echo "🎉 NovaVoice is ready to start!"
  echo "================================================"
  
  # Execute the main command
  exec "$@"
}

# Handle different commands
case "$1" in
  "bundle")
    # Standard Rails server startup
    main "$@"
    ;;
  "rails")
    # Rails console or other Rails commands
    shift
    exec bundle exec rails "$@"
    ;;
  "bash"|"sh")
    # Interactive shell
    exec "$@"
    ;;
  "migrate")
    # Just run migrations
    wait_for_db
    check_database
    run_migrations
    echo "✅ Migrations completed"
    ;;
  "setup")
    # Full setup without starting server
    main echo "Setup completed"
    ;;
  *)
    # Custom command
    exec "$@"
    ;;
esac