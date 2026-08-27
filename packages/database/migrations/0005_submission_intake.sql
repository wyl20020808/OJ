CREATE TABLE IF NOT EXISTS submissions (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL,
  problem_id text NOT NULL,
  problem_revision_id text NOT NULL,
  testdata_version_ref text NOT NULL,
  language_id text NOT NULL,
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','QUEUED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submissions_owner_time_idx ON submissions(owner_user_id, created_at, id);
CREATE INDEX IF NOT EXISTS submissions_problem_time_idx ON submissions(problem_id, created_at, id);
