ALTER TABLE problem_revisions
  DROP CONSTRAINT IF EXISTS problem_revisions_source_type_check;

ALTER TABLE problem_revisions
  ADD CONSTRAINT problem_revisions_source_type_check
  CHECK (source_type IN ('CREATOR','EXTERNAL','IMPORT','TEST_FIXTURE','API_AUTOMATION'));
