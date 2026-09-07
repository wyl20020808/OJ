CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120), description text NOT NULL DEFAULT '',
  avatar_url text, visibility text NOT NULL CHECK (visibility IN ('PUBLIC','PRIVATE')),
  join_policy text NOT NULL CHECK (join_policy IN ('OPEN','REQUEST','INVITE_ONLY')),
  owner_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teams_public_idx ON teams(visibility, updated_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS team_members (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','MANAGER','MEMBER')), joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(team_id,user_id)
);
CREATE INDEX IF NOT EXISTS team_members_page_idx ON team_members(team_id, joined_at, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS team_one_owner_idx ON team_members(team_id) WHERE role='OWNER';
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, invited_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS team_pending_invitation_idx ON team_invitations(team_id, invited_user_id) WHERE status='PENDING';
CREATE TABLE IF NOT EXISTS team_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  message text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS team_pending_join_request_idx ON team_join_requests(team_id,user_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS team_join_requests_page_idx ON team_join_requests(team_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS team_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id), code_hash text NOT NULL UNIQUE, expires_at timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0), used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_invite_codes_lookup_idx ON team_invite_codes(code_hash) WHERE is_active;
