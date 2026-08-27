CREATE TABLE IF NOT EXISTS auth_roles (name text PRIMARY KEY, permissions text[] NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS auth_user_roles (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_name text NOT NULL REFERENCES auth_roles(name) ON DELETE CASCADE, PRIMARY KEY (user_id, role_name));
CREATE INDEX IF NOT EXISTS auth_user_roles_user_idx ON auth_user_roles (user_id);
