CREATE TABLE IF NOT EXISTS judge_pool_control (
  control_id integer PRIMARY KEY CHECK (control_id = 1),
  policy jsonb NOT NULL,
  control_version integer NOT NULL CHECK (control_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS judge_autoscaler_decisions (
  decision_id text PRIMARY KEY,
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS judge_autoscaler_decisions_created_idx
  ON judge_autoscaler_decisions(created_at DESC);
