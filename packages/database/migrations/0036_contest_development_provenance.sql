ALTER TABLE contests
  ADD COLUMN IF NOT EXISTS provenance jsonb;

CREATE INDEX IF NOT EXISTS contests_development_provenance_idx
  ON contests ((provenance->>'scenario'))
  WHERE provenance->>'kind' = 'DEVELOPMENT_FIXTURE';
