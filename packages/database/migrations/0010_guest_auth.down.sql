DROP TABLE IF EXISTS guest_resume_credentials;
DROP TABLE IF EXISTS guest_identities;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
