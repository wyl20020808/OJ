DROP TABLE IF EXISTS auth_oauth_transactions;
DROP TABLE IF EXISTS auth_onboarding_continuations;
DROP TABLE IF EXISTS auth_verification_grants;
DROP TABLE IF EXISTS auth_verification_challenges;
DROP TABLE IF EXISTS auth_identities;
ALTER TABLE user_credentials DROP COLUMN IF EXISTS password_login_enabled;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE email IS NULL) THEN
    RAISE EXCEPTION
      'cannot restore users.email NOT NULL while NULL email rows remain; remove Guest users before rolling back Auth V2';
  END IF;
END
$$;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
