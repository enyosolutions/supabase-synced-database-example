# How to Keep Your Entire Database State in Your Repository (Supabase Edition)

---

**Tired of losing database changes between environments? Here's how I solved it by keeping EVERYTHING in version control.**

## The Problem

I was constantly running into issues where:
- **RLS UI is annoying** - managing policies through Supabase dashboard is clunky and error-prone
- **RLS deployment bugs** - policies weren't being deployed as part of go-live, or were named differently from what they actually do
- My local database was different from staging
- Staging was different from production
- Database functions, triggers, and policies were getting lost
- Cron jobs would disappear after deployments
- Team members had inconsistent database states
- **Row Level Security policies would drift** - manual changes in Supabase dashboard weren't in code


## Why Create Your Own Migration Runner?

You might be thinking: "Supabase has its own migration system, why reinvent the wheel?"

Here's why I built my own:

- **I was tired of needing to diff the database every time** I needed to create a table or add a column
- **I'm fluent in SQL**, so I don't want to use the Supabase UI for database changes
- **Supabase migration system kept breaking** and often required resetting the database state (#annoying #shittyDx)

The Supabase migration system is great for simple use cases, but when you have complex database state (functions, triggers, policies, cron jobs) and need reliable deployments, you need something more robust.

## The Solution: Database State as Code

I created a system that keeps your **entire database state** in your repository:

```
supabase/
├── run.js                 # Migration runner (the magic)
├── db-migrations/         # Schema changes
├── db-functions/          # PostgreSQL functions
├── policies.sql           # Row Level Security
├── triggers.sql           # Database triggers
└── cron.sql              # Scheduled jobs
```

## How It Works

### 1. The Migration Runner (`run.js`)

This is the core of the system. It:
- Tracks which migrations have been applied in a `supabase_migrations` table
- Compares local files with applied migrations
- Runs pending migrations in order
- Handles rollbacks on errors
- Manages functions, triggers, policies, and cron jobs

### 2. Package.json Commands

```json
{
  "scripts": {
    "migrate": "node supabase/run.js",
    "sync:db": "node supabase/run.js --db",
    "sync:policies": "node supabase/run.js --policies",
    "create:migration": "yarn migration --create",
    "create:function": "yarn migration --create --func",
    "list:migrations": "yarn migration --list",
    "revert:migration": "yarn migration --revert"
  }
}
```

### 3. Complete CLI Reference

The migration runner provides comprehensive CLI options:

```bash
# Run all pending migrations
yarn migrate

# Run a specific migration
yarn migration <migration-name>

# Skip a migration permanently
yarn migration <migration-name> --skip

# Revert an already played migration
yarn migration <migration-name> --revert

# List all migrations (applied and pending)
yarn migration --list

# Create a new migration file
yarn migration --create <name>

# Create a new function file
yarn migration --create <name> --func

# Run in debug mode
yarn migration --debug

# Sync database policies only
yarn migration --policies

# Sync everything (functions, triggers, policies, cron)
yarn migration --db

# Run without transactions (for statements that can't run in transactions)
yarn migration --no-transaction

# Show help
yarn migration --help
```

### 4. File Organization

**Migrations** (`db-migrations/`):
```sql
-- 2024-01-01_00_00_00_000Z-initial-schema.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL
);
```

**Functions** (`db-functions/`):
```sql
-- 2024-01-01_00_00_00_000Z-get-user-posts.sql
CREATE OR REPLACE FUNCTION get_user_posts(user_uuid UUID)
RETURNS TABLE (id UUID, title TEXT) AS $$
BEGIN
  RETURN QUERY SELECT p.id, p.title FROM posts p WHERE p.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;
```

**Policies** (`policies.sql`):
```sql
-- CRITICAL: This function must be at the top
SELECT supabase_migrations.drop_policies_in_transaction();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);
```

**Triggers** (`triggers.sql`):
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

**Cron Jobs** (`cron.sql`):
```sql
SELECT cron.schedule(
  'cleanup-old-data',
  '0 2 * * *',
  'DELETE FROM posts WHERE created_at < NOW() - INTERVAL ''1 year'';'
);
```

## 🚨 Critical: Policy Synchronization

The `drop_policies_in_transaction()` function is **essential** for keeping RLS policies in sync:

```sql
-- This function drops all existing policies before applying new ones
CREATE
OR REPLACE FUNCTION supabase_migrations.drop_policies_in_transaction () RETURNS void LANGUAGE plpgsql AS $function$
DECLARE policy_record RECORD;
BEGIN -- Create a temporary table to store the policies
CREATE TEMPORARY TABLE temp_policies AS
SELECT *
FROM pg_policies
WHERE schemaname = 'public';
-- Loop through the policies and drop each one
FOR policy_record IN (
  SELECT *
  FROM temp_policies
) LOOP BEGIN EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON "' || policy_record.tablename || '"';
EXCEPTION
WHEN OTHERS THEN -- Log the exception or take appropriate action
RAISE NOTICE 'Error dropping policy % on table %: %',
policy_record.policyname,
policy_record.tablename,
SQLERRM;
END;
END LOOP;
-- Drop the temporary table
DROP TABLE IF EXISTS temp_policies;
END;
$function$;
```

**Why this is crucial:**
- Policies can be created manually in Supabase dashboard
- These manual policies won't be in your code
- Without dropping them first, you'll have **orphaned policies**
- The function ensures only policies defined in your code exist
- **Prevents security drift** - your RLS rules are always exactly what you've defined

## CI/CD Integration

Here's how to integrate it into your GitHub Actions:

```yaml
# .github/workflows/deploy.yml
- name: Deploy and migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    yarn deploy
    yarn migrate
    yarn sync:db
```

The key steps:
1. **Deploy your app** (Supabase functions, etc.)
2. **Run migrations** (`yarn migrate`) - applies schema changes
3. **Sync database state** (`yarn sync:db`) - applies functions, triggers, policies, cron

## Benefits

✅ **Consistent environments** - Everyone has the same database state
✅ **Version controlled** - All changes are tracked in git
✅ **Rollback support** - Can revert specific migrations
✅ **Team collaboration** - No more "works on my machine"
✅ **CI/CD ready** - Automated database deployments
✅ **Comprehensive** - Functions, triggers, policies, cron jobs included
✅ **Policy synchronization** - No more orphaned RLS policies

## Getting Started

1. **Copy the structure** from the example below
2. **Set up your database connection**:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
   ```
3. **Run your first migration**:
   ```bash
   yarn migrate
   ```

## Example Repository

I've created a minimal example showing the complete setup: [database-state-example](link-to-your-repo)

The key files are:
- `package.json` - All the CLI commands
- `supabase/run.js` - The migration runner (this is the magic)
- `supabase/db-functions/drop-policies-function.sql` - Critical for policy sync

## Why This Works

Traditional migration systems only handle schema changes. This approach treats your **entire database state** as code:

- **Schema** → `db-migrations/`
- **Functions** → `db-functions/`
- **Security** → `policies.sql` (with automatic cleanup)
- **Automation** → `triggers.sql`
- **Scheduling** → `cron.sql`

Everything is version controlled, everything is applied consistently, and everything can be rolled back.

## Pro Tips

1. **Use timestamps** in migration names for ordering
2. **Keep functions separate** from migrations for better organization
3. **Test locally first** before pushing to staging/prod
4. **Use the `--no-transaction` flag** for migrations that can't run in transactions
5. **Check `yarn migration --list`** to see what's pending
6. **Always include `drop_policies_in_transaction()`** at the top of policies.sql

This approach has completely eliminated database drift issues for my team. No more "it works on my machine" - everyone's database is identical, including security policies.

What do you think? Anyone else using a similar approach?
