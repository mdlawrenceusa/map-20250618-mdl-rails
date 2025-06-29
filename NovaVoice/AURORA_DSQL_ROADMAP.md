# Aurora DSQL Roadmap for Student Connect SaaS

## Current Status (NovaVoice - Voice AI for Churches)
- **Aurora DSQL Cluster**: `lyabugbxayepatoxdewlxwdo7q` (ACTIVE)
- **Purpose**: R&D prototype for future SaaS platform
- **Current Usage**: Minimal (cost-optimized)
- **Data**: 5 prompts, 3 sample leads, 2 campaigns

## Architecture Decisions Made

### Compatibility Issues Solved
1. **Type Mapping**: Aurora DSQL doesn't support standard PostgreSQL type maps
2. **Serial Columns**: Must use explicit bigint with application-managed IDs
3. **Advisory Locks**: Not supported - disabled in Rails configuration
4. **DDL Transactions**: Multiple DDL statements must be executed separately
5. **TRUNCATE/IDENTITY**: Not supported - use DELETE and manual ID management

### Rails Integration Workarounds
- Custom initializers for Aurora DSQL compatibility
- Raw SQL queries for complex operations
- String-based type mapping for all results
- Disabled ActiveRecord features that conflict with DSQL

## Future SaaS Platform (Student Connect)

### Target Architecture
```
Multi-Tenant Educational Platform
├── Aurora DSQL (Global distributed database)
│   ├── Schema per institution/school
│   ├── Lesson plans stored as prompts
│   ├── Student progress tracking
│   └── Multi-region deployment
├── Nova Sonic AI (Educational interactions)
├── Web Interface (No Vonage telephony)
└── Rails Admin (Institution management)
```

### Data Model for Student Connect
```sql
-- Institution-specific schemas
CREATE SCHEMA school_12345;

-- Core tables per institution
CREATE TABLE school_12345.lesson_plans (
  id bigint NOT NULL,
  instructor_id bigint NOT NULL,
  subject varchar(100),
  content text,
  ai_prompt text,
  active boolean DEFAULT true,
  created_at timestamp,
  updated_at timestamp
);

CREATE TABLE school_12345.students (
  id bigint NOT NULL,
  name varchar(255),
  email varchar(255),
  grade_level varchar(50),
  created_at timestamp
);

CREATE TABLE school_12345.student_interactions (
  id bigint NOT NULL,
  student_id bigint,
  lesson_plan_id bigint,
  transcript text,
  duration integer,
  completed_at timestamp
);
```

### Scaling Benefits
- **Pay-per-request**: Cost scales with actual usage
- **Global distribution**: Students worldwide get low latency
- **No connection pooling**: Handles thousands of concurrent students
- **Multi-tenant isolation**: Each school's data completely separated
- **Compliance ready**: Built for educational data privacy requirements

## Development Phases

### Phase 1: Stabilize NovaVoice (Current)
- [x] Aurora DSQL prototype created
- [x] Compatibility issues documented and solved
- [x] Cost-optimized cluster running
- [ ] Voice calling app fully stabilized
- [ ] DynamoDB integration perfected

### Phase 2: Student Connect Development
- [ ] Fork codebase for new SaaS application
- [ ] Remove Vonage/telephony components
- [ ] Implement multi-tenant schema management
- [ ] Build instructor lesson plan interface
- [ ] Adapt Nova Sonic for educational prompts

### Phase 3: SaaS Launch Preparation
- [ ] Multi-region Aurora DSQL deployment
- [ ] Institution onboarding flow
- [ ] Billing/subscription management
- [ ] Educational compliance features
- [ ] Performance optimization at scale

## Cost Management
- **Current**: ~$0.50/day (minimal usage)
- **Development**: Scale as needed during Student Connect development
- **Production**: Pay-per-request scales with actual student usage

## Technical Debt to Address
1. **ActiveRecord Integration**: Build proper Aurora DSQL adapter
2. **Schema Management**: Automated multi-tenant schema creation
3. **Migration System**: Handle schema changes across all tenants
4. **Monitoring**: Multi-tenant performance monitoring

## Key Learnings for SaaS
1. Aurora DSQL is perfect for multi-tenant SaaS architecture
2. Bypass ActiveRecord for complex queries when needed
3. Use raw SQL for performance-critical operations
4. Plan schema design for tenant isolation from day one
5. Cost scales beautifully with actual usage (no idle server costs)

---

**Next Steps**: Keep cluster running, continue NovaVoice development, prepare for Student Connect fork when ready.