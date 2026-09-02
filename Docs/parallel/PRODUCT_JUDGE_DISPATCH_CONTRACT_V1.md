# Product Judge Dispatch Contract V1

Product creates the Submission under the authenticated principal and then sends
the existing `JudgeServiceClient` an idempotent request with the opaque
Submission ID, evaluation generation, C++20 profile, source SHA-256/source,
and existing 2C.4 testcase manifest. Product starts its durable
`submission_evaluations` row from the returned Judge job ID.

The Judge Service remains the owner of Judge jobs, attempts, Worker routing,
Supervisor execution, and authoritative verdict. Product polls only the Judge
Service safe DTO, converts a terminal result through `productPublication`, and
writes `submission_evaluations`. The Judge Service and Worker do not read
Product PostgreSQL.

Duplicate initial dispatches use `submission:<id>:evaluation:1`; rejudge uses
the next explicit evaluation generation. Product publication remains guarded by
the existing job, evaluation, attempt, digest, and current-generation checks.
