# Phase 2A Execution Result Contract

Status: FROZEN; protocol version `2A.1`.

Required envelope: `protocol_version`, `judge_job_id`, `worker_id`, `worker_instance_id`, `attempt`, `started_at`, `completed_at`, `execution_stage`, `synthetic_qualification`, `outcome`, `diagnostic_code`, `safe_diagnostic_message`, and `correlation_id`.

Allowed Phase 2A outcomes are `SAFE_FIXTURE_SUCCEEDED`, `SAFE_FIXTURE_FAILED_RETRYABLE`, `SAFE_FIXTURE_FAILED_TERMINAL`, `CANCELLED`, `WORKER_PROTOCOL_ERROR`, and `WORKER_CAPABILITY_MISMATCH`. All have `synthetic_qualification: true`. None maps to AC, WA, TLE, MLE, RE, CE, a testcase result, compile result, resource usage, or a real verdict.

The Coordinator accepts only one valid current-lease result for a job/attempt. Equivalent duplicate delivery converges idempotently; a different, stale, wrong-job, wrong-attempt, expired, or malformed result is rejected without changing a newer state. Public projections omit source, raw lease token, credentials, internal queue metadata, and any future execution artifact.

Future extension namespaces for `compile`, `testcases`, `resource_usage`, and `verdict` are reserved but absent in Phase 2A. They must not be populated with fabricated values.
