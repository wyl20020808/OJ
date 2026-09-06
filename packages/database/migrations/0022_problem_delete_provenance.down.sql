DROP INDEX IF EXISTS problems_active_listing_idx;
ALTER TABLE problems DROP CONSTRAINT IF EXISTS problems_source_type_check;
UPDATE problems SET source_type='CREATOR' WHERE source_type IN ('TEST_FIXTURE','API_AUTOMATION');
ALTER TABLE problems ADD CONSTRAINT problems_source_type_check
  CHECK (source_type IN ('CREATOR','EXTERNAL','IMPORT'));
ALTER TABLE problem_revisions DROP COLUMN IF EXISTS provenance;
ALTER TABLE problems DROP COLUMN IF EXISTS provenance;
ALTER TABLE problems DROP COLUMN IF EXISTS delete_reason;
ALTER TABLE problems DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE problems DROP COLUMN IF EXISTS deleted_at;
