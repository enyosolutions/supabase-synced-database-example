-- Function to get user posts with pagination
CREATE OR REPLACE FUNCTION get_user_posts(
  user_uuid UUID,
  page_size INTEGER DEFAULT 10,
  page_number INTEGER DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.content,
    p.created_at,
    COUNT(*) OVER() as total_count
  FROM posts p
  WHERE p.user_id = user_uuid
  ORDER BY p.created_at DESC
  LIMIT page_size
  OFFSET (page_number - 1) * page_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION get_user_posts IS 'Get paginated posts for a specific user';