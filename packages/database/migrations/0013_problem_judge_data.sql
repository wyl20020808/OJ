CREATE TABLE IF NOT EXISTS problem_judge_configs (
  problem_id text PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  time_limit_ms integer NOT NULL,
  memory_limit_bytes bigint NOT NULL,
  output_limit_bytes bigint NOT NULL,
  checker text NOT NULL,
  allowed_language_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (time_limit_ms > 0 AND memory_limit_bytes > 0 AND output_limit_bytes > 0),
  CHECK (checker IN ('EXACT_BYTES','TOKEN_WHITESPACE'))
);
CREATE TABLE IF NOT EXISTS problem_judge_drafts (
  problem_id text PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'DRAFT',
  revision integer NOT NULL DEFAULT 0,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('DRAFT','VALIDATED'))
);
CREATE TABLE IF NOT EXISTS problem_judge_draft_testcases (
  testcase_id text PRIMARY KEY,
  problem_id text NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  label text,
  input_ref jsonb NOT NULL,
  expected_output_ref jsonb NOT NULL,
  time_limit_ms_override integer,
  memory_limit_bytes_override bigint,
  output_limit_bytes_override bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(problem_id, ordinal)
);
CREATE TABLE IF NOT EXISTS judge_data_versions (
  version_id text PRIMARY KEY,
  problem_id text NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  manifest_sha256 text NOT NULL,
  checker text NOT NULL,
  testcase_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NOT NULL,
  published_by text NOT NULL,
  manifest jsonb NOT NULL,
  UNIQUE(problem_id, version_number),
  UNIQUE(problem_id, manifest_sha256),
  CHECK (checker IN ('EXACT_BYTES','TOKEN_WHITESPACE'))
);
CREATE TABLE IF NOT EXISTS judge_data_version_testcases (
  version_id text NOT NULL REFERENCES judge_data_versions(version_id) ON DELETE RESTRICT,
  testcase_id text NOT NULL,
  ordinal integer NOT NULL,
  testcase jsonb NOT NULL,
  PRIMARY KEY(version_id, testcase_id),
  UNIQUE(version_id, ordinal)
);
CREATE INDEX IF NOT EXISTS judge_data_versions_problem_idx ON judge_data_versions(problem_id, version_number DESC);
CREATE INDEX IF NOT EXISTS judge_data_draft_cases_problem_idx ON problem_judge_draft_testcases(problem_id, ordinal);
