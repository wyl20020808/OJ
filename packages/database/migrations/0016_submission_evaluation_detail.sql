ALTER TABLE submission_evaluations
  ADD COLUMN IF NOT EXISTS detail jsonb;
