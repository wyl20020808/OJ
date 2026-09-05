# OJPlatform Runtime Reliability + Real Qualification V1

Date: 2026-09-05
Branch: codex/runtime-reliability-v1

## Scope

This goal addressed JudgeData ZIP upload failures, real submission
INFRA_FAILED results, and Runtime Manager source/health qualification.
Browser click-through qualification was intentionally left to the user.

## Issue 1: JudgeData ZIP

- Root cause: multi-megabyte ZIP bytes were base64-encoded into one JSON field.
  The API decoder used a giant regular expression and overflowed the V8 stack
  (RangeError: Maximum call stack size exceeded).
- Fix: ZIP upload now uses raw application/zip; Fastify uses a bounded 256 MiB
  buffer parser. Pair upload remains base64 JSON. ZIP validation and storage
  limits remain enforced.
- Evidence: 212-byte ZIP returned HTTP 200. A 4,195,790-byte ZIP changed from
  HTTP 500 to HTTP 200 (API duration 354.6 ms).
- Bounded streaming: NO in the strict disk-streaming sense. Transport is
  bounded and no longer base64-amplified; current implementation buffers within
  the explicit parser limit.

## Issue 3: Real INFRA_FAILED

- Reproduced submission:
  bb39ecf6-e596-422c-bd4e-25bfc4277f68
- Judge job: 21e783af-99c0-452f-9e70-efeb1a3f9423
- Worker evidence: three attempts logged
  Supervisor HTTP status 400: real execution-set request rejected.
- Root cause: Runtime reused a stale /opt/ojplatform/bin/supervisor whose health
  reported the single-testcase contract 2C.3, while Worker sent execution-set
  contract 2C.4. Every set was rejected before testcase execution.
- Fix: Supervisor health exposes execution_set_contract_version; Runtime
  Manager qualifies that field, rebuilds stale binaries from selected feature
  source, restarts protocol-mismatched services, and uses a user-writable
  runtime binary path. Source path conversion was corrected for WSL.
- Runtime evidence after fix: Supervisor health reports
  execution_set_contract_version: 2C.4; Manager DOCTOR READY; all services and
  REAL_SANDBOXED_EXECUTION Worker healthy; MIXED SOURCE = False.
- Browser resubmission and final testcase verdict were not run by this agent.
  User will perform that qualification.

## Issue 4: SSE

Existing code-level SSE subscription-after-snapshot fix remains in place.
Browser live event-chain qualification was not executed in this pass per user
request. No claim is made for terminal grid updates, browser receipt, or final
DOM state.

## Validation

- pnpm exec vitest run tests/problem-judge-data.test.ts tests/problem-editor.test.tsx: 30 PASS
- pnpm typecheck: PASS
- go test ./... in apps/judge-worker: 64 PASS
- go test ./... in apps/sandbox-supervisor: PARTIAL. 39 tests passed, 5 failed:
  Windows trusted-probe syscall build incompatibility and four existing
  root/cgroup/lifecycle fixture assumptions.
- Runtime Manager start -Verify: DOCTOR READY
- Runtime Manager status: Web/API/Judge/Host Agent/Supervisor RUNNING,
  Worker RUNNING_OWNED, PostgreSQL/Redis/MinIO reachable, MIXED SOURCE=False.
- Browser E2E: NOT VERIFIED BY AGENT (delegated to user).

## Commits

- 13d6cc8 fix: bound judge data zip upload transport
- cf2b6ee fix: qualify runtime supervisor protocol
- 878da49 fix: rebuild stale supervisor binary
- 1e731fd fix: build supervisor from feature source
- f170888 fix: use writable supervisor runtime binary
- 391e64a fix: expose execution set contract health

Main was not merged. User files outside this worktree were not touched.

## Status

PARTIAL: code fixes and runtime contract qualification are implemented and
tested; browser ZIP persistence/Validate and live SSE terminal-chain evidence
remain user-owned qualification steps.
