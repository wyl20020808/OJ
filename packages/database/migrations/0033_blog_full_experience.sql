CREATE TABLE IF NOT EXISTS discussion_categories (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  data_origin text NOT NULL DEFAULT 'SYSTEM'
    CHECK (data_origin IN ('SYSTEM', 'DEVELOPMENT_FIXTURE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discussion_tags (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  data_origin text NOT NULL DEFAULT 'SYSTEM'
    CHECK (data_origin IN ('SYSTEM', 'DEVELOPMENT_FIXTURE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discussion_posts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'DISCUSSION',
  ADD COLUMN IF NOT EXISTS category_id bigint REFERENCES discussion_categories(id),
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_origin text NOT NULL DEFAULT 'USER';

UPDATE discussion_posts
SET kind = 'ANNOUNCEMENT'
WHERE type = 'ANNOUNCEMENT' AND kind <> 'ANNOUNCEMENT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_posts_kind_check'
  ) THEN
    ALTER TABLE discussion_posts
      ADD CONSTRAINT discussion_posts_kind_check
      CHECK (kind IN ('DISCUSSION', 'SOLUTION', 'ANNOUNCEMENT'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_posts_cover_image_url_check'
  ) THEN
    ALTER TABLE discussion_posts
      ADD CONSTRAINT discussion_posts_cover_image_url_check
      CHECK (cover_image_url IS NULL OR length(cover_image_url) <= 2048);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_posts_data_origin_check'
  ) THEN
    ALTER TABLE discussion_posts
      ADD CONSTRAINT discussion_posts_data_origin_check
      CHECK (data_origin IN ('USER', 'DEVELOPMENT_FIXTURE'));
  END IF;
END $$;

ALTER TABLE discussion_comments
  ADD COLUMN IF NOT EXISTS data_origin text NOT NULL DEFAULT 'USER';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discussion_comments_data_origin_check'
  ) THEN
    ALTER TABLE discussion_comments
      ADD CONSTRAINT discussion_comments_data_origin_check
      CHECK (data_origin IN ('USER', 'DEVELOPMENT_FIXTURE'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS discussion_post_tags (
  post_id uuid NOT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
  tag_id bigint NOT NULL REFERENCES discussion_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS discussion_posts_kind_public_idx
  ON discussion_posts(kind, status, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS discussion_posts_category_public_idx
  ON discussion_posts(category_id, status, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS discussion_posts_featured_idx
  ON discussion_posts(is_featured DESC, is_pinned DESC, published_at DESC, id DESC)
  WHERE status = 'PUBLISHED';
CREATE INDEX IF NOT EXISTS discussion_post_tags_tag_idx
  ON discussion_post_tags(tag_id, post_id);
