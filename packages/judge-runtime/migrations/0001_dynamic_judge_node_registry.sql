CREATE TABLE IF NOT EXISTS judge_nodes (
  node_id text PRIMARY KEY,
  incarnation text NOT NULL,
  runtime_version text NOT NULL,
  capabilities jsonb NOT NULL,
  max_concurrent_jobs integer NOT NULL CHECK (max_concurrent_jobs BETWEEN 1 AND 64),
  active_jobs integer NOT NULL DEFAULT 0 CHECK (active_jobs >= 0),
  state text NOT NULL CHECK (state IN ('REGISTERING','ONLINE','BUSY','DRAINING','OFFLINE','UNHEALTHY')),
  last_heartbeat_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS judge_nodes_scheduler_idx ON judge_nodes(state,last_heartbeat_at,node_id);
CREATE TABLE IF NOT EXISTS judge_node_assignments (
  assignment_id text PRIMARY KEY,
  judge_job_id text NOT NULL,
  node_id text NOT NULL REFERENCES judge_nodes(node_id),
  incarnation text NOT NULL,
  attempt_generation integer NOT NULL CHECK (attempt_generation > 0),
  status text NOT NULL CHECK (status IN ('LEASED','COMPLETED','EXPIRED')),
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS judge_node_assignments_active_attempt_idx ON judge_node_assignments(judge_job_id,attempt_generation) WHERE status='LEASED';
CREATE INDEX IF NOT EXISTS judge_node_assignments_node_idx ON judge_node_assignments(node_id,incarnation,status);
