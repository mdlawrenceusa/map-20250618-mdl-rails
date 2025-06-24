# NovaVoice Prompt Management System

A comprehensive Rails-based prompt management system for Nova Sonic AI voice assistant integration.

## 🎯 Features

- **Versioned Prompts**: Automatic versioning with activation/deactivation
- **Hierarchical Customization**: Global → Campaign → Lead-specific prompts
- **Template Variables**: Dynamic content with `{{variable}}` substitution
- **Performance Caching**: Redis-based caching for fast prompt retrieval
- **RESTful API**: Complete CRUD operations via API endpoints
- **Admin Interface**: Web-based prompt management UI
- **Microservice Integration**: Seamless integration with Node.js microservice

## 📋 Prompt Types

- **system**: Core AI personality and instructions for Nova Sonic
- **greeting**: Opening message when calls are answered
- **scheduling**: Meeting scheduling flow and available times
- **objection_handling**: Responses to common objections
- **closing**: Call completion and confirmation messages
- **custom**: User-defined prompt types

## 🏗️ Architecture

### Database Schema

```sql
CREATE TABLE prompts (
  id INTEGER PRIMARY KEY,
  name VARCHAR NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  is_active BOOLEAN DEFAULT FALSE NOT NULL,
  prompt_type VARCHAR NOT NULL,
  metadata TEXT,
  lead_id INTEGER REFERENCES leads(id),
  campaign_id VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Priority Hierarchy

1. **Lead-specific**: Prompts assigned to specific leads (highest priority)
2. **Campaign-specific**: Prompts for marketing campaigns
3. **Global**: Default prompts (fallback)

## 🚀 API Endpoints

### Core Operations

```bash
# Get current active prompt (with hierarchy)
GET /api/v1/prompts/current?type=system&lead_id=123&campaign_id=holiday_2024

# List all prompts with filtering
GET /api/v1/prompts?active=true&type=greeting&campaign_id=test

# Get specific prompt
GET /api/v1/prompts/:id

# Create new prompt version
POST /api/v1/prompts
Content-Type: application/json
{
  "prompt": {
    "name": "nova_sonic_system",
    "content": "You are Esther...",
    "prompt_type": "system",
    "campaign_id": "holiday_2024"
  }
}
```

### Management Operations

```bash
# Activate/deactivate prompts
PATCH /api/v1/prompts/:id/activate
PATCH /api/v1/prompts/:id/deactivate

# Duplicate prompt as new version
POST /api/v1/prompts/:id/duplicate

# Render prompt with variables
POST /api/v1/prompts/render
{
  "prompt_id": 123,
  "variables": {
    "pastor_name": "John Doe",
    "available_slots": "Monday 2pm, Tuesday 10am"
  }
}

# Clear cache
POST /api/v1/prompts/clear_cache
```

## 📱 Admin Interface

Access the web-based admin interface at:
```
http://localhost:8080/api/v1/prompts/admin
```

Features:
- View all prompts with filtering
- Activate/deactivate prompts
- Duplicate prompts for new versions
- Test prompt fetching with different parameters
- Clear cache manually
- Real-time statistics

## 🔧 Rails Integration

### Model Usage

```ruby
# Find current active prompt with hierarchy
prompt = Prompt.current_prompt(
  type: 'system',
  lead_id: 123,
  campaign_id: 'holiday_2024'
)

# Create new version
new_prompt = Prompt.create_new_version!(
  name: 'nova_sonic_system',
  content: 'You are Esther...',
  prompt_type: 'system',
  campaign_id: 'spring_2024'
)

# Render with variables
rendered = prompt.render_content(
  pastor_name: 'John Doe',
  church_name: 'First Baptist'
)
```

### Caching Service

```ruby
# Fetch with caching
prompt_data = PromptCacheService.fetch_prompt(
  type: 'system',
  lead_id: 123,
  campaign_id: 'test'
)

# Clear specific cache
PromptCacheService.clear_prompt_cache(
  type: 'system',
  campaign_id: 'test'
)

# Warm cache for performance
PromptCacheService.warm_cache
```

## 🔌 Microservice Integration

### TypeScript Client

```typescript
import { promptClient } from './prompt-client';

// Fetch current prompt
const prompt = await promptClient.getCurrentPrompt(
  'system',
  leadId,
  campaignId
);

// Get default prompts for Nova Sonic
const prompts = await promptClient.getDefaultPrompts(leadId, campaignId);
console.log(prompts.system);    // System prompt
console.log(prompts.greeting);  // Greeting prompt
console.log(prompts.scheduling); // Scheduling prompt
```

### Outbound Call Integration

```bash
# Make call with automatic prompt fetching
curl -X POST http://localhost:3000/calls \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "leadId": 123,
    "campaignId": "holiday_2024"
  }'
```

## 🎮 Getting Started

### 1. Setup Database

```bash
# Run migration
bundle exec rails db:migrate

# Seed default prompts
bundle exec rails prompts:seed
```

### 2. Create Demo Data

```bash
# Create demo prompts for testing
bundle exec rails runner db/seeds/demo_prompts.rb

# List all prompts
bundle exec rails prompts:list
```

### 3. Test API

```bash
# Start Rails server
PORT=8080 bin/rails server -b 0.0.0.0

# Test API endpoints
curl "http://localhost:8080/api/v1/prompts/current?type=system"
curl "http://localhost:8080/api/v1/prompts/current?type=greeting&campaign_id=holiday_2024"
```

### 4. Start Microservice

```bash
cd microservice
PORT=3000 npm run dev
```

## 📊 Examples

### Global System Prompt
```
You are Esther, a warm and professional scheduling assistant for Mike Lawrence Productions. 
Your ONLY purpose is to schedule 15-minute web meetings between senior pastors and Mike Lawrence 
to discuss spreading the Gospel through modern outreach programs.

Keep responses brief (under 25 words), be warm and professional.
Available time slots: {{available_slots}}
Current date/time: {{current_datetime}}
```

### Campaign-Specific Holiday Prompt
```
You are Esther from Mike Lawrence Productions calling about our SPECIAL HOLIDAY OUTREACH program.

HOLIDAY FOCUS:
- Christmas/Easter themed Gospel outreach
- Limited time offer for 2024 holiday season

Emphasize urgency and holiday theme in all responses.
```

### Lead-Specific Personalized Prompt
```
You are Esther calling Pastor Johnson specifically.

CONTEXT: Pastor Johnson expressed interest at the Baptist Convention.

Reference the conversation about reaching younger generations.
Confirm this is Pastor Johnson from First Baptist Church.
```

## 🧪 Testing

### Integration Test
```bash
# Run comprehensive test
ruby test_integration.rb
```

### Manual Testing
```bash
# Test different prompt priorities
curl "http://localhost:8080/api/v1/prompts/current?type=system"                           # Global
curl "http://localhost:8080/api/v1/prompts/current?type=system&campaign_id=holiday_2024" # Campaign
curl "http://localhost:8080/api/v1/prompts/current?type=system&lead_id=416"              # Lead-specific
```

## 🔧 Management Tasks

```bash
# Clear prompt cache
bundle exec rails prompts:clear_cache

# Warm cache for performance
bundle exec rails prompts:warm_cache

# List prompts by type
bundle exec rails prompts:list
```

## 🚀 Production Considerations

1. **Caching**: Uses Rails.cache (configure Redis for production)
2. **Database**: Indexed for fast lookups on type, lead_id, campaign_id
3. **Versioning**: Automatic deactivation of old versions
4. **Monitoring**: Cache hit rates and prompt usage statistics
5. **Backup**: Regular backup of prompt content for compliance

## 📚 API Documentation

Full API documentation available at: [API Endpoints](#-api-endpoints)

Web admin interface: `http://localhost:8080/api/v1/prompts/admin`