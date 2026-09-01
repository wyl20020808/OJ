CREATE TABLE IF NOT EXISTS contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC','PRIVATE')),
  lifecycle text NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle IN ('DRAFT','PUBLISHED','CANCELLED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  registration_open_at timestamptz NULL,
  registration_close_at timestamptz NULL,
  access_code_hash text NULL,
  format text NOT NULL DEFAULT 'ICPC' CHECK (format IN ('ICPC','IOI','OI','CUSTOM')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (registration_close_at IS NULL OR registration_open_at IS NULL OR registration_close_at >= registration_open_at)
);
CREATE INDEX IF NOT EXISTS contests_public_listing_idx ON contests(lifecycle, visibility, starts_at, id);
CREATE INDEX IF NOT EXISTS contests_owner_idx ON contests(owner_user_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS contest_roles (
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','MANAGER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS contest_problems (
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  problem_id text NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  label text NULL CHECK (label IS NULL OR char_length(label) <= 16),
  points_config jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, problem_id),
  UNIQUE (contest_id, ordinal)
);

CREATE TABLE IF NOT EXISTS contest_registrations (
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WITHDRAWN')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id)
);
CREATE INDEX IF NOT EXISTS contest_registrations_active_idx ON contest_registrations(contest_id, registered_at, user_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS contest_submission_bindings (
  contest_id uuid NOT NULL REFERENCES contests(id) ON DELETE RESTRICT,
  problem_id text NOT NULL,
  submission_id text NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id),
  FOREIGN KEY (contest_id, problem_id) REFERENCES contest_problems(contest_id, problem_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS contest_submission_bindings_list_idx ON contest_submission_bindings(contest_id, user_id, created_at DESC, submission_id DESC);
