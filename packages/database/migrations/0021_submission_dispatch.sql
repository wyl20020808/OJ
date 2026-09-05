ALTER TABLE submissions ADD COLUMN dispatch_failure_code text;
CREATE TABLE submission_dispatches (
  submission_id text PRIMARY KEY REFERENCES submissions(id),
  evaluation_generation integer NOT NULL DEFAULT 1 CHECK (evaluation_generation = 1),
  request_id text NOT NULL,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','DELIVERING','RETRY','FAILED','SUCCEEDED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_id text,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  failure_code text,
  artifact_id text,
  judge_job_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submission_dispatch_ready ON submission_dispatches(next_attempt_at)
  WHERE state IN ('QUEUED','RETRY','DELIVERING');
-- Existing orphaned initial submissions become recoverable without another submission.
INSERT INTO submission_dispatches(submission_id,request_id)
SELECT id,id FROM submissions s WHERE status='PENDING' AND judge_data_version_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM submission_evaluations e WHERE e.submission_id=s.id);
