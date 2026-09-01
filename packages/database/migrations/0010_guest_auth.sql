ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

CREATE TABLE IF NOT EXISTS guest_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  upgraded_at timestamptz NULL,
  metadata_version integer NOT NULL DEFAULT 1 CHECK (metadata_version > 0)
);

CREATE TABLE IF NOT EXISTS guest_resume_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_identity_id uuid NOT NULL REFERENCES guest_identities(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  rotated_from_id uuid NULL REFERENCES guest_resume_credentials(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS guest_resume_active_idx ON guest_resume_credentials(token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS guest_identity_user_idx ON guest_identities(user_id) WHERE revoked_at IS NULL;
