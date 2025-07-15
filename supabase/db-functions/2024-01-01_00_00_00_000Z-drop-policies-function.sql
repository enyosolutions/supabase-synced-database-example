-- Function to drop all existing policies before applying new ones
-- This is crucial for keeping policies in sync with your code
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

-- Add comment explaining the function's purpose
COMMENT ON FUNCTION supabase_migrations.drop_policies_in_transaction() IS
'Drops all existing RLS policies in the public schema. This function must be called at the beginning of policies.sql to ensure policies are always in sync with the codebase.';