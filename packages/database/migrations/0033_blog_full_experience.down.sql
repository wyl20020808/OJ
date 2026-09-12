DROP INDEX IF EXISTS discussion_post_tags_tag_idx;
DROP INDEX IF EXISTS discussion_posts_featured_idx;
DROP INDEX IF EXISTS discussion_posts_category_public_idx;
DROP INDEX IF EXISTS discussion_posts_kind_public_idx;
DROP TABLE IF EXISTS discussion_post_tags;
ALTER TABLE discussion_comments DROP COLUMN IF EXISTS data_origin;
ALTER TABLE discussion_posts
  DROP COLUMN IF EXISTS data_origin,
  DROP COLUMN IF EXISTS is_pinned,
  DROP COLUMN IF EXISTS is_featured,
  DROP COLUMN IF EXISTS cover_image_url,
  DROP COLUMN IF EXISTS category_id,
  DROP COLUMN IF EXISTS kind;
DROP TABLE IF EXISTS discussion_tags;
DROP TABLE IF EXISTS discussion_categories;
