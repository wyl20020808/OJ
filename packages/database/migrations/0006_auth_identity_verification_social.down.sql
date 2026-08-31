DROP TABLE IF EXISTS auth_oauth_transactions;
DROP TABLE IF EXISTS auth_onboarding_continuations;
DROP TABLE IF EXISTS auth_verification_grants;
DROP TABLE IF EXISTS auth_verification_challenges;
DROP TABLE IF EXISTS auth_identities;
ALTER TABLE user_credentials DROP COLUMN IF EXISTS password_login_enabled;
UPDATE users
SET email = 'legacy-' || id::text || '@invalid.local'
WHERE email IS NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
