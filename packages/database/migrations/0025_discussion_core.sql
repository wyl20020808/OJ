CREATE TABLE IF NOT EXISTS discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  author_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('ARTICLE','ANNOUNCEMENT')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','DELETED')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  summary text,
  content_markdown text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id),
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0)
);
CREATE INDEX IF NOT EXISTS discussion_posts_public_idx ON discussion_posts(status,published_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS discussion_posts_author_idx ON discussion_posts(author_id,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS discussion_posts_type_idx ON discussion_posts(type,status,published_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS discussion_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES discussion_posts(id),
  author_id uuid NOT NULL REFERENCES users(id),
  parent_comment_id uuid REFERENCES discussion_comments(id),
  content_markdown text NOT NULL,
  status text NOT NULL DEFAULT 'VISIBLE' CHECK (status IN ('VISIBLE','DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS discussion_comments_post_idx ON discussion_comments(post_id,created_at,id);
CREATE TABLE IF NOT EXISTS discussion_post_likes (
  post_id uuid NOT NULL REFERENCES discussion_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS discussion_post_likes_post_idx ON discussion_post_likes(post_id,user_id);
