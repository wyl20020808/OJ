# Product + Judge + UI Remediation V1 Report

## Status

`PARTIAL`

Start OJ main: `cdb07ea44ed3be4b1a028a02622fce84059c7d9e`.
Start plugin main: `560a5ae2eeff704e4b00f99704bf868bd409ac5c`.

## Implemented and Tested

- Issue 2: a published Judge Data version can now be explicitly cloned to an
  editable draft. The published version remains immutable; effective per-case
  limits are retained in the draft. The editor exposes this only when there is
  no active draft. Focused backend/UI tests pass.
- Issue 6: evaluation problem cells render `Pxxxx Title`, link to the problem,
  and render verdicts as semantic-color plain text rather than filled status
  containers.
- Issue 7: login keeps the identifier as raw text while typing. It classifies
  only when a login action is submitted; phone login accepts only
  `^1[3-9]\\d{9}$` and rejects `+86` input. Frontend and password endpoint
  validation use the same China-mainland rule.
- Issue 8: the Product Judge Admin adapter now consumes the normal
  `JUDGE_SERVICE_URL` and `JUDGE_SERVICE_TOKEN` when dedicated admin variables
  are absent. This matches the existing runtime's environment contract without
  changing Runtime Manager code.
- Issue 4: testcase snapshot rendering now has state boxes driven by real
  snapshot/event facts: waiting dot, running ellipsis, AC check, non-AC cross,
  and a distinct infrastructure mark.
- Issue 5: the separate OnlineCodeEditor branch applies the 320px minimum to
  the CodeMirror host, editor, and scroller, instead of relying on an unresolved
  `height: 100%` ancestor.

## Runtime Evidence and Blocker

`scripts/dev-runtime.ps1 start` was used. It completed infrastructure reuse,
both migration ledgers, Supervisor readiness, and Worker binary build, then
Judge Service failed to bind `127.0.0.1:3100` with `EADDRINUSE`.

A subsequent official `scripts/dev-runtime.ps1 stop` was attempted from this
worktree. It correctly did not manually terminate a process: the shared Judge
Service rejected drain/stop for three existing Workers with HTTP `409`, so
application services remained owned by
`D:\OJPlatform-worktrees\final-feature-integration`. Shared Judge Service logs
also showed a different Worker repeatedly receiving `401` for heartbeat and
assignment claims. This is a cross-worktree runtime ownership and credential
mix, not evidence from this branch. The Goal forbids modifying Runtime Manager
control-plane files, so no workaround was applied.

Consequently the following are **not runtime verified**:

- Issue 1: no fresh small/large formal submission comparison, no lower-level
  `REAL_EXECUTION_SET_INFRA_FAILURE` cause, and no root-cause fix are claimed.
- Issue 3: implementation route exists but browser navigation to the hosted
  editor was not checked.
- Issue 4: no real SSE, terminal testcase event, or browser DOM transition was
  observed.
- Issue 5: plugin tests/build pass; real-browser rendered CodeMirror height was
  not measured.
- Issue 7: focused DOM regression verifies stable raw input; real browser was
  not run.
- Issue 8: adapter configuration is tested by build/type coverage only; Product
  to Judge Admin browser/runtime call was not observed.

## Validation

- Product focused Vitest: PASS, 89 tests across Judge Data, editor, evaluation
  detail, login, and Judge Admin suites.
- Product TypeScript typecheck: PASS.
- Product Web build: PASS.
- Product API build: PASS.
- Judge Worker `go test ./...`: PASS, 63 tests in 9 packages.
- Supervisor `go test ./...`: BLOCKED on Windows by existing Linux syscall and
  runtime-dependent failures; no Supervisor source was changed.
- Plugin tests: PASS, 31 tests in 17 files.
- Plugin typecheck and build: PASS.
- Browser smoke: NOT VERIFIED because the managed application runtime did not
  start.

## Scope Guard

No Runtime Manager, BAT launcher, shared runtime registry, database migration,
or user artifact was modified.
