# Product/Judge/UI Remediation Runtime Resume V1 Report

## Status

`PARTIAL`

Canonical main was merged into remediation. Runtime and browser qualification
remains blocked by an unreconciled, persisted Judge Worker.

## History

- Canonical main source HEAD: `511830d15df8fff565cad5d10ef4b7da7e79ab27`
- Remediation pre-merge HEAD: `025b61f96b14dfc0a0aa44af95a4c48ec3a2a829`
- Merge commit: `4b0ea17c4d47f67baab7b10012fec9e8c8c4ce11`
- Plugin remediation HEAD: `373b9bc240ffe1cc02ac7d7f26c397708944790f`

## Implemented

- Canonical Runtime Legacy Reconciliation merged into remediation; no merge
  back to `main`.
- `Get-PortOwner` falls back to `netstat.exe` when Windows
  `Get-NetTCPConnection` omits a live listener, preserving PID proof and
  external/unknown fail-closed behavior.
- Ownership test creates a real loopback listener and verifies its PID.
- Evaluation-list UI test matches the implemented `Pxxxx Title` presentation.

## Runtime Evidence

Official `scripts/dev-runtime.ps1 stop` completed after the listener fix.
Application ports `5173`, `3010`, `3100`, `3180`, and `19092` had no listener.
PostgreSQL `55432`, Redis `56379`, and MinIO `59000` remained running.

Official `scripts/dev-runtime.ps1 start` completed infrastructure reuse,
migrations, Supervisor readiness, Judge Service, API, and Host Agent startup,
but did not complete Worker ONLINE or Web startup.

Persisted Host Agent state identifies Worker PID `41396` with executable
`D:\OJPlatform-worktrees\product-judge-ui-remediation\.runtime\bin\judge-worker.exe`.
The new Host Agent reports it as unreconciled live ownership, exposes no owned
worker, and rejects a new worker start with lifecycle conflict. The Worker
repeatedly receives Judge Service `409 Conflict` assignment claims.

PID `32004` is also a live `judge-worker.exe` without a verified shared
ownership record and remains untouched. No manual process termination was used.

This is a Host Agent durable-worker lifecycle blocker: a restarted Host Agent
does not adopt a persisted Worker child handle, while Runtime Manager has no
safe control-plane path to stop that persisted inactive Worker. Fail-closed
rules prevent claiming a clean Runtime.

## Qualification

- Issue 1 formal small/failing submissions: `NOT RUN`
- Issue 4 real SSE, testcase terminal, live DOM update: `NOT RUN`
- Issue 8 Product-to-Judge Admin browser check: `NOT RUN`
- Issue 2 JudgeData edit browser smoke: `NOT RUN`
- Issues 3, 5, 7 prior browser evidence retained from prior report.
- Issue 6 browser smoke: `NOT RUN`; focused assertion passes.

No claim is made that `REAL_EXECUTION_SET_INFRA_FAILURE` is fixed or that the
new Supervisor diagnostic is running in a formal submission.

## Validation

- Product focused Vitest: `PASS`, 83 tests across 7 focused files.
- Product typecheck, Web build, API build: `PASS`.
- Judge Worker `go test ./...`: `PASS`, 64 tests across 9 packages.
- Supervisor `go test ./cmd/supervisor`: `PASS`, 11 tests.
- Plugin tests, typecheck, build: `PASS`.
- `scripts/test-dev-runtime-ownership.ps1`: `PASS`.
- `git diff --check`: `PASS` before report edits.

## Remaining Blocker

Implement an authenticated reconciliation operation that stops only a
persisted Worker after verifying executable path, PID creation time, node
incarnation, and zero active jobs. Unknown/external Workers must remain
fail-closed. Re-run official Stop, Start, formal submissions, SSE/browser, and
Admin Judge qualification afterward.
