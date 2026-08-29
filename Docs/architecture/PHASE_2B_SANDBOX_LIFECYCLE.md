# PHASE 2B Sandbox Lifecycle

`PREPARE -> VALIDATE_POLICY -> CREATE_ISOLATION -> STAGE_TRUSTED_PROBE -> START -> RUNNING -> CANCEL/LIMIT/EXIT -> COLLECT_RESULT -> TEARDOWN -> VERIFY_CLEAN -> CLOSED`

Failure states are explicit: setup failure, mount failure, namespace failure, cgroup failure, probe start failure, timeout, cancellation and cleanup failure. Cleanup failure is security-significant and cannot return PASS. The Supervisor records correlation ID, state transitions, bounded timestamps and sanitized failure codes; it never records source, secrets, raw commands or host paths.

