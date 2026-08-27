CREATE TABLE IF NOT EXISTS problems (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  statement text NOT NULL,
  input_description text NOT NULL,
  output_description text NOT NULL,
  examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints text NOT NULL,
  notes text NOT NULL DEFAULT '',
  time_limit_ms integer NOT NULL CHECK (time_limit_ms > 0),
  memory_limit_bytes bigint NOT NULL CHECK (memory_limit_bytes > 0),
  visibility text NOT NULL CHECK (visibility IN ('private','public')),
  status text NOT NULL CHECK (status IN ('draft','published','archived')),
  testdata_version text,
  author_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS problems_public_listing_idx ON problems (status, visibility, created_at, id);
CREATE INDEX IF NOT EXISTS problems_author_idx ON problems (author_id, created_at);
