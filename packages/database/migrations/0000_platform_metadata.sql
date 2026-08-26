CREATE TABLE IF NOT EXISTS _ojplatform_platform_metadata (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
