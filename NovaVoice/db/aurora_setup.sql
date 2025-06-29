-- Aurora DSQL Setup Script for NovaVoice Production

-- Create the production database
CREATE DATABASE novavoice_production;

-- Connect to the database
\c novavoice_production;

-- Create schemas for Rails multi-database setup
CREATE SCHEMA IF NOT EXISTS solid_cache;
CREATE SCHEMA IF NOT EXISTS solid_queue;
CREATE SCHEMA IF NOT EXISTS solid_cable;

-- Create application user with appropriate permissions
CREATE USER novavoice_app WITH PASSWORD 'CHANGE_ME_IN_SECRETS_MANAGER';

-- Grant permissions on database
GRANT CONNECT ON DATABASE novavoice_production TO novavoice_app;
GRANT USAGE ON SCHEMA public TO novavoice_app;
GRANT CREATE ON SCHEMA public TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO novavoice_app;

-- Grant permissions for cache, queue, and cable schemas
GRANT USAGE ON SCHEMA solid_cache TO novavoice_app;
GRANT CREATE ON SCHEMA solid_cache TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA solid_cache TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA solid_cache TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA solid_cache GRANT ALL ON TABLES TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA solid_cache GRANT ALL ON SEQUENCES TO novavoice_app;

GRANT USAGE ON SCHEMA solid_queue TO novavoice_app;
GRANT CREATE ON SCHEMA solid_queue TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA solid_queue TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA solid_queue TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA solid_queue GRANT ALL ON TABLES TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA solid_queue GRANT ALL ON SEQUENCES TO novavoice_app;

GRANT USAGE ON SCHEMA solid_cable TO novavoice_app;
GRANT CREATE ON SCHEMA solid_cable TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA solid_cable TO novavoice_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA solid_cable TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA solid_cable GRANT ALL ON TABLES TO novavoice_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA solid_cable GRANT ALL ON SEQUENCES TO novavoice_app;