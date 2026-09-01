CREATE TABLE IF NOT EXISTS judge_service_jobs (
  judge_job_id text PRIMARY KEY,
  client_request_id text NOT NULL UNIQUE,
  external_submission_id text NOT NULL,
  evaluation_generation integer NOT NULL CHECK (evaluation_generation > 0),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED_WITH_VERDICT','CANCELLED','INFRA_FAILED','NO_VERDICT')),
  job_request jsonb NOT NULL,
  result_projection jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS judge_service_jobs_external_idx
  ON judge_service_jobs(external_submission_id,evaluation_generation);
CREATE TABLE IF NOT EXISTS judge_service_evaluations (
  judge_job_id text NOT NULL REFERENCES judge_service_jobs(judge_job_id) ON DELETE CASCADE,
  evaluation_generation integer NOT NULL CHECK (evaluation_generation > 0),
  attempt_generation integer NOT NULL CHECK (attempt_generation >= 0),
  status text NOT NULL,
  verdict text,
  result_digest text,
  result_projection jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (judge_job_id,attempt_generation),
  CHECK ((status = 'COMPLETED_WITH_VERDICT') = (verdict IS NOT NULL))
);
