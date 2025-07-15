# Supbase Database State Management Example

This is a minimal example showing how to keep your entire database state in your repository using Supabase : Policies, triggers, cron, functions etc.

## Why 

I was constantly running into issues where:
- **RLS UI is annoying** - managing policies through Supabase dashboard is clunky and error-prone
- **RLS deployment bugs** - policies weren't being deployed as part of go-live, or were named differently from what they actually do
- My local database was different from staging
- Staging was different from production
- Database functions, triggers, and policies were getting lost
- We were increasingly relying on postgres db functions and because of that a function code was changing often.
- Cron jobs would disappear after deployments
- Team members had inconsistent database states
- **Row Level Security policies would drift** - manual changes in Supabase dashboard weren't in code

So i decided to build a simple system to allow syncing our database across developers and envs.

## Project Structure

```
database-state-example/
├── supabase/
│   ├── run.js                 # Migration runner script
│   ├── db-migrations/         # SQL migration files
│   ├── db-functions/          # PostgreSQL functions
│   ├── policies.sql           # Row Level Security policies
│   ├── triggers.sql           # Database triggers
│   └── cron.sql              # Scheduled jobs
├── package.json              # CLI commands and dependencies
└── README.md                 # This file
```

## Key Features

- **Version-controlled database state**: All migrations, functions, policies, triggers, and cron jobs are in your repo
- **Simple migration system**: Track which migrations have been applied
- **Comprehensive CLI**: Create, run, revert, and manage database changes
- **CI/CD ready**: Easy integration with deployment pipelines
- **Policy synchronization**: Automatic cleanup and recreation of RLS policies

## Quick Start

1. Install dependencies:
```bash
yarn install
```

2. Set up your database connection:
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

3. Run migrations:
```bash
yarn migrate
```

## Available Commands

- `yarn migrate` - Run all pending migrations
- `yarn sync:db` - Sync functions, triggers, policies, and cron jobs
- `yarn create:migration <name>` - Create a new migration file
- `yarn create:function <name>` - Create a new PostgreSQL function
- `yarn list:migrations` - List applied and pending migrations
- `yarn revert:migration <name>` - Revert a specific migration
- `yarn help` - Show all available commands

## How It Works

The `run.js` script:
1. Connects to your database
2. Creates a `supabase_migrations` table to track applied migrations
3. Compares local migration files with applied migrations
4. Runs pending migrations in order
5. Records successful migrations in the tracking table

This ensures your database state is always in sync with your codebase.

## Important: Policy Management

The `drop_policies_in_transaction()` function is crucial for keeping Row Level Security policies in sync:

```sql
-- This must be at the top of policies.sql
SELECT supabase_migrations.drop_policies_in_transaction();
```

**Why this is important:**
- Policies can be created manually in the database (via Supabase dashboard)
- These manual policies won't be in your code
- Without dropping them first, you'll have orphaned policies
- The function ensures only policies defined in your code exist

This prevents policy drift and ensures your security rules are always exactly what you've defined in your repository.
