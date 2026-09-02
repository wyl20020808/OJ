ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_judge_data_binding_complete,
  DROP COLUMN IF EXISTS judge_data_manifest_sha256,
  DROP COLUMN IF EXISTS judge_data_version_number,
  DROP COLUMN IF EXISTS judge_data_version_id;
