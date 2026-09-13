ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS provider_problem_id text;

ALTER TABLE problem_revisions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS provider_problem_id text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_provider_check'
  ) THEN
    ALTER TABLE problems ADD CONSTRAINT problems_provider_check
      CHECK (provider IN ('LUOGU','CODEFORCES','ATCODER','LEETCODE','ACWING','SPOJ','OTHER'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problem_revisions_provider_check'
  ) THEN
    ALTER TABLE problem_revisions ADD CONSTRAINT problem_revisions_provider_check
      CHECK (provider IN ('LUOGU','CODEFORCES','ATCODER','LEETCODE','ACWING','SPOJ','OTHER'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_provider_problem_id_check'
  ) THEN
    ALTER TABLE problems ADD CONSTRAINT problems_provider_problem_id_check
      CHECK (provider_problem_id IS NULL OR (length(trim(provider_problem_id)) BETWEEN 1 AND 64));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problem_revisions_provider_problem_id_check'
  ) THEN
    ALTER TABLE problem_revisions ADD CONSTRAINT problem_revisions_provider_problem_id_check
      CHECK (provider_problem_id IS NULL OR (length(trim(provider_problem_id)) BETWEEN 1 AND 64));
  END IF;
END $$;

UPDATE problem_revisions r
SET provider = p.provider,
    provider_problem_id = p.provider_problem_id
FROM problems p
WHERE p.id = r.problem_id
  AND (r.provider IS DISTINCT FROM p.provider
    OR r.provider_problem_id IS DISTINCT FROM p.provider_problem_id);

CREATE INDEX IF NOT EXISTS problems_provider_public_idx
  ON problems(provider, public_number)
  WHERE deleted_at IS NULL AND visibility = 'public' AND status = 'published';
