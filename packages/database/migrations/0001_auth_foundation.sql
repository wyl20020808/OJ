CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE, email text NOT NULL UNIQUE, display_name text NOT NULL, status text NOT NULL CHECK (status IN ('active','disabled')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_credentials (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS auth_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx ON auth_sessions (token_hash, expires_at) WHERE revoked_at IS NULL;
