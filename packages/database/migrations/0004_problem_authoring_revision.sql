CREATE TABLE IF NOT EXISTS problem_revisions (
  id text PRIMARY KEY,
  problem_id text NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  slug text NOT NULL, title text NOT NULL, statement text NOT NULL,
  input_description text NOT NULL, output_description text NOT NULL,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb, constraints text NOT NULL,
  notes text NOT NULL DEFAULT '', time_limit_ms integer NOT NULL CHECK (time_limit_ms > 0),
  memory_limit_bytes bigint NOT NULL CHECK (memory_limit_bytes > 0),
  visibility text NOT NULL CHECK (visibility IN ('private','public')),
  status text NOT NULL CHECK (status IN ('draft','published','archived')),
  testdata_version text, author_id text, created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(problem_id, revision_number)
);
ALTER TABLE problems ADD COLUMN IF NOT EXISTS current_revision_id text;
CREATE INDEX IF NOT EXISTS problem_revisions_problem_idx ON problem_revisions(problem_id, revision_number);
