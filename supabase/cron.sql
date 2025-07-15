-- Enable the cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Clean up old data every day at 2 AM
SELECT cron.schedule(
  'cleanup-old-data',
  '0 2 * * *',
  'DELETE FROM posts WHERE created_at < NOW() - INTERVAL ''1 year'';'
);

-- Update user statistics every hour
SELECT cron.schedule(
  'update-user-stats',
  '0 * * * *',
  'UPDATE users SET post_count = (SELECT COUNT(*) FROM posts WHERE user_id = users.id);'
);