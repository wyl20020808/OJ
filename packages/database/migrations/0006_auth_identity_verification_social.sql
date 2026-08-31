ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE user_credentials ADD COLUMN IF NOT EXISTS password_login_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('EMAIL','PHONE','PROVIDER')),
  normalized_value text NOT NULL,
  provider text NULL CHECK (provider IN ('wechat','qq','google','github') OR provider IS NULL),
  provider_subject text NULL,
  display_name text NULL,
  avatar_url text NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  identity_key text GENERATED ALWAYS AS (
    CASE
      WHEN kind = 'PROVIDER' THEN 'PROVIDER:' || provider || ':' || provider_subject
      ELSE kind || ':' || normalized_value
    END
  ) STORED UNIQUE,
  CHECK ((kind = 'PROVIDER' AND provider IS NOT NULL AND provider_subject IS NOT NULL) OR
         (kind <> 'PROVIDER' AND provider IS NULL AND provider_subject IS NULL))
);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(user_id, created_at, id);
INSERT INTO auth_identities (user_id,kind,normalized_value,verified_at)
SELECT id,'EMAIL',lower(trim(email)),created_at
FROM users
WHERE email IS NOT NULL AND trim(email) <> ''
ON CONFLICT (identity_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_verification_challenges (
  id uuid PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('EMAIL','SMS')),
  purpose text NOT NULL CHECK (purpose IN ('REGISTER','LOGIN_CODE','ADD_IDENTIFIER')),
  destination text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  resend_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts > 0),
  consumed_at timestamptz NULL,
  state text NOT NULL CHECK (state IN ('ISSUED','VERIFIED','CONSUMED','EXPIRED','LOCKED_ATTEMPTS','SUPERSEDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_verification_destination_idx
  ON auth_verification_challenges(channel, purpose, destination, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_verification_grants (
  id uuid PRIMARY KEY,
  challenge_id uuid NOT NULL REFERENCES auth_verification_challenges(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('REGISTER','LOGIN_CODE','ADD_IDENTIFIER')),
  destination text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS auth_onboarding_continuations (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('OTP','OAUTH')),
  identity_kind text NOT NULL CHECK (identity_kind IN ('EMAIL','PHONE','PROVIDER')),
  identity_value text NOT NULL,
  provider text NULL CHECK (provider IN ('wechat','qq','google','github') OR provider IS NULL),
  provider_subject text NULL,
  display_name text NULL,
  avatar_url text NULL,
  email text NULL,
  email_verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  link_user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_oauth_transactions (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('wechat','qq','google','github')),
  state_hash text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  nonce text NOT NULL,
  return_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('LOGIN','LINK'))
);
CREATE INDEX IF NOT EXISTS auth_oauth_transactions_expiry_idx
  ON auth_oauth_transactions(provider, expires_at) WHERE consumed_at IS NULL;
