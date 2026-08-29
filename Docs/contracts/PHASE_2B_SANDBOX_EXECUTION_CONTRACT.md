# PHASE 2B Sandbox Execution Contract

Contract version: `2B.0-bootstrap`.

The only enabled mode is `SANDBOX_PROBE_QUALIFICATION`. `REAL_SUBMISSION_EXECUTION` is disabled and fail-closed.

## Required Request

`sandbox_contract_version`, `sandbox_job_id`, `judge_job_id`, trusted worker and worker-instance context, `trusted_probe_id`, `probe_version`, `probe_hash`, immutable artifact/input references, CPU/wall/memory/output/process/thread/file limits, filesystem/network/syscall policy IDs, correlation ID, cancellation/deadline, and a supervisor-owned result destination.

The Supervisor validates schema, bounds, immutable probe registry membership, exact hash, policy versions, job linkage and deadline before creating isolation. Unknown version/probe/policy, hash mismatch, malformed limits, missing linkage, or real-submission mode is rejected.

## Forbidden Inputs

There is no arbitrary shell command, executable path, host path, mount path, environment injection, network target, syscall allowlist, privilege/device request, or secret field. Probe selection is controlled by repository code and Lead configuration, never by Submission text.

## Result

Only a bounded qualification result and sanitized telemetry leave the Supervisor. Source, credentials, lease tokens, command lines and host paths are excluded. Cleanup failure is a security-significant failure, never a successful result.

