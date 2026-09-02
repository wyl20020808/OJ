ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS judge_data_version_id text,
  ADD COLUMN IF NOT EXISTS judge_data_version_number integer,
  ADD COLUMN IF NOT EXISTS judge_data_manifest_sha256 text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submissions_judge_data_binding_complete'
      AND conrelid = 'submissions'::regclass
  ) THEN
    ALTER TABLE submissions
      ADD CONSTRAINT submissions_judge_data_binding_complete
      CHECK (
        (judge_data_version_id IS NULL AND judge_data_version_number IS NULL AND judge_data_manifest_sha256 IS NULL)
        OR (
          judge_data_version_id IS NOT NULL
          AND judge_data_version_number > 0
          AND judge_data_manifest_sha256 ~ '^[a-f0-9]{64}$'
        )
      );
  END IF;
END $$;
