DROP INDEX IF EXISTS problems_provider_public_idx;

ALTER TABLE problem_revisions
  DROP CONSTRAINT IF EXISTS problem_revisions_provider_problem_id_check,
  DROP CONSTRAINT IF EXISTS problem_revisions_provider_check,
  DROP COLUMN IF EXISTS provider_problem_id,
  DROP COLUMN IF EXISTS provider;

ALTER TABLE problems
  DROP CONSTRAINT IF EXISTS problems_provider_problem_id_check,
  DROP CONSTRAINT IF EXISTS problems_provider_check,
  DROP COLUMN IF EXISTS provider_problem_id,
  DROP COLUMN IF EXISTS provider;
