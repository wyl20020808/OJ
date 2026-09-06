ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS provenance jsonb;
ALTER TABLE problem_revisions
  ADD COLUMN IF NOT EXISTS provenance jsonb;
ALTER TABLE problems DROP CONSTRAINT IF EXISTS problems_source_type_check;
ALTER TABLE problems ADD CONSTRAINT problems_source_type_check
  CHECK (source_type IN ('CREATOR','EXTERNAL','IMPORT','TEST_FIXTURE','API_AUTOMATION'));
CREATE INDEX IF NOT EXISTS problems_active_listing_idx ON problems (status, visibility, created_at, id) WHERE deleted_at IS NULL;
