CREATE TABLE IF NOT EXISTS submission_evaluations (
  submission_id text NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  evaluation_generation integer NOT NULL CHECK (evaluation_generation > 0),
  attempt_generation integer NOT NULL CHECK (attempt_generation >= 0),
  judge_job_id text NOT NULL,
  testcase_set_id text,
  manifest_hash text,
  verdict_record_digest text,
  evaluation_record_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED_WITH_VERDICT','CANCELLED','INFRA_FAILED','NO_VERDICT','INCOMPLETE','REJUDGE_PENDING','REJUDGING')),
  verdict text CHECK (verdict IN ('AC','WA','CE','RE','TLE','MLE')),
  current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (submission_id, evaluation_generation),
  CHECK ((status = 'COMPLETED_WITH_VERDICT') = (verdict IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS submission_evaluations_current_idx
  ON submission_evaluations(submission_id) WHERE current;
CREATE INDEX IF NOT EXISTS submission_evaluations_history_idx
  ON submission_evaluations(submission_id, evaluation_generation);
