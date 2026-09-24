-- Prompt provenance (Stage 6, additive): the caller's opaque labels for the authored business
-- prompt that composed `instructions` — `{promptApplied: boolean, promptVersion: string}`.
-- Identifiers only, never prompt content. The column is named `provenance` (the 0036 contests
-- precedent): it carries safe provenance labels exactly like every other non-content column, and
-- the mechanical name scan that forbids content-shaped columns stays strict.

ALTER TABLE ai_capability_usage_requests
  ADD COLUMN IF NOT EXISTS provenance jsonb;
