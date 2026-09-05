CREATE TABLE judge_artifacts (
  artifact_id text PRIMARY KEY CHECK (artifact_id ~ '^[a-f0-9]{64}$'),
  problem_id text NOT NULL,
  judge_data_version_id text NOT NULL UNIQUE REFERENCES judge_data_versions(version_id),
  format_version text NOT NULL CHECK (format_version = 'judge-artifact-v1'),
  content_length integer NOT NULL CHECK (content_length > 0 AND content_length <= 262144),
  sha256 text NOT NULL CHECK (sha256 = artifact_id),
  manifest_text text NOT NULL,
  reference_metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CHECK (octet_length(manifest_text) = content_length)
);
