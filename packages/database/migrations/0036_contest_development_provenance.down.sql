DROP INDEX IF EXISTS contests_development_provenance_idx;

ALTER TABLE contests
  DROP COLUMN IF EXISTS provenance;
