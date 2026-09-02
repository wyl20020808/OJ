CREATE TABLE IF NOT EXISTS problem_favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id text NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, problem_id)
);
CREATE INDEX IF NOT EXISTS problem_favorites_user_created_idx
  ON problem_favorites(user_id, created_at DESC, problem_id DESC);
