# Phase 2A Execution Request Contract

Status: FROZEN; protocol version `2A.1`.

| Field | Required | Source of truth / trust | Validator | Phase 2A use |
|---|---|---|---|---|
| `protocol_version` | yes | Coordinator trusted | exact `2A.1` | compatibility gate |
| `judge_job_id`, `submission_id`, `correlation_id` | yes | Coordinator trusted immutable linkage | non-empty UUID/opaque ID | idempotency/audit |
| `attempt` | yes | Queue authoritative | positive safe integer/current attempt | lease/result binding |
| `problem_revision_id`, `testdata_version_ref`, `language_id` | yes | Submission/Problem immutable linkage | non-empty approved ref | provenance only |
| `source_snapshot_ref`, `source_sha256` | yes | Coordinator-owned immutable opaque reference | fixed opaque ref and SHA-256 format | provenance only; never read for fixture selection or execution |
| `limits` | yes | Coordinator policy | positive time/memory/output/process descriptor | future contract data only |
| `execution_mode` | yes | Coordinator enum | `SAFE_FIXTURE_QUALIFICATION` only | selects safe executor |
| `fixture_id` | yes in safe mode | qualification control owned | one of documented fixture IDs | deterministic internal behavior |
| `deadline_at`, `cancellation_generation` | yes | Coordinator trusted control metadata | valid UTC deadline/non-negative integer | bounded cancellation observation |

The request does not contain an Application DB credential, Redis credential, session token, arbitrary shell command, user-controlled executable path, arbitrary user environment, inline source body, or untrusted fixture instruction. Unknown fixture, missing/invalid ID, bad immutable reference, non-current attempt, unsupported mode, capability mismatch, and incompatible protocol are rejected before execution.

`REAL_SANDBOXED_EXECUTION` is a reserved future enum value and is rejected with `WORKER_CAPABILITY_MISMATCH` in Phase 2A. Limits do not imply enforcement until a separately qualified Sandbox phase.
