CREATE TABLE IF NOT EXISTS discussion_comment_likes (
  comment_id uuid NOT NULL REFERENCES discussion_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS discussion_comment_likes_comment_idx
  ON discussion_comment_likes(comment_id, user_id);
