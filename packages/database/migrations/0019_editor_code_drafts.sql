CREATE TABLE IF NOT EXISTS editor_code_drafts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id text NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  source text NOT NULL CHECK (octet_length(source) <= 524288),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, problem_id, language)
);
CREATE INDEX IF NOT EXISTS editor_code_drafts_lookup_idx
  ON editor_code_drafts (problem_id, language, user_id);
