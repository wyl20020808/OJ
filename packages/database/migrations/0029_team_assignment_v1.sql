CREATE SEQUENCE IF NOT EXISTS assignment_public_number_seq;
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_number bigint NOT NULL UNIQUE,
  public_id text NOT NULL UNIQUE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  starts_at timestamptz,
  due_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at IS NULL OR starts_at IS NULL OR due_at > starts_at)
);
CREATE INDEX IF NOT EXISTS assignments_team_idx ON assignments(team_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS assignment_problems (
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  problem_id text NOT NULL REFERENCES problems(id),
  display_order integer NOT NULL CHECK (display_order >= 0),
  PRIMARY KEY (assignment_id, problem_id),
  UNIQUE (assignment_id, display_order)
);
CREATE INDEX IF NOT EXISTS assignment_problems_problem_idx ON assignment_problems(problem_id,assignment_id);
