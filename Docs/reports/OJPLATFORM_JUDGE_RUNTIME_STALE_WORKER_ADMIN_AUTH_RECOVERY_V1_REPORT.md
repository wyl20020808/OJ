# OJPlatform Judge Runtime Stale Worker and Admin Auth Recovery V1

Date: 2026-09-08
Branch: `main`

## Result

`PASS` for the requested local runtime recovery and two lifecycle qualification.
No Judge business data, submission, evaluation history, or job state was
modified. Runtime was left stopped after the second clean Stop.

## Source

- `MAIN_HEAD_BEFORE`: `f823239152b85c690cbae447e9bf02c80e58b11f`
- `MAIN_HEAD_AFTER`: recorded in the final commit below; canonical checkout stayed `main`.
- Canonical root: `D:\OJPlatform`.
- Canonical plugin: `D:\OJPlatformPlugins\OnlineCodeEditor`.

## Admin Auth Root Cause

The defect was an unauthenticated Judge reuse check: runtime startup accepted
`/health` without proving that the live process used the persisted admin token.
This allowed an older runtime generation on port 3100 to survive while Stop
used the current persisted `x-judge-service-token`; Judge rejected it with 401.
The historical process token itself could not be fingerprinted after that
process exited, so token drift is established by the 401 plus the missing reuse
contract, not by logging the old credential. Stop correctly treated active-job
state as unknown and refused termination. The repaired startup requires an
authenticated admin probe. Current `GET /v1/admin/nodes` returned 200; the same
endpoint with a wrong token returned 401.

Token values are not recorded. Runtime token was present; fingerprint was
`6cc0fe3f1571`. Judge Service token contract matched after restart.

## Worker Evidence and Recovery

Read-only inventory at recovery start found one live `judge-worker.exe`:

- PID `29788`, executable `C:\Users\WYL20\AppData\Local\OJPlatform\runtime\ojplatform-local\bin\judge-worker.exe`.
- Host Agent registry node `cpp20-gcc-13-v1-1788622313524-1`, registry PID `29788`, active jobs `0`.
- Parent PID `36628` was no longer alive; process start time and executable path matched the registry and canonical Worker binary.
- Classification: `REGISTERED_STALE`; action: scoped `taskkill /PID 29788 /T /F` through recovery helper; result: terminated and binary lock released.

The historical PID `14180` was re-read and was not live; it was not acted on.
No unregistered or external Worker was terminated. New Worker PID `49936` in
lifecycle 1 and a later Worker in lifecycle 2 were children of the current
Host Agent and registered normally. Host registry ended with one current node
while running and zero unreconciled nodes; final Stop removed it.

## Code Changes

- `scripts/dev-runtime.ps1`: authenticated Judge admin probe; fail-closed
  unknown-job handling; stale Worker identity/recovery with PID, path,
  start-time, registry, node active-job, and parent checks; BOM-free Host Agent
  state rewrite; Worker metadata reuse across commit-only source changes.
- `scripts/test-judge-runtime-recovery.ps1`: focused auth, fail-closed,
  identity, active-job, two-stale-worker, registry-reconciliation tests.

Stop ownership classifier was not refactored.

## Runtime Qualification

Two preliminary Start attempts were not counted as lifecycle PASS. The first
recovered the verified stale Worker, then exposed a PowerShell 5 UTF-8 BOM in
the rewritten Host Agent state (`HOST_AGENT_STATE_UNREADABLE`). Rewriting the
file alone left the already-running Host Agent's initialization error cached,
so the second attempt failed likewise. Formal Stop succeeded, the state writer
was repaired to emit BOM-free UTF-8 atomically, and a fresh Host Agent loaded
the reconciled state. No job or evaluation data was changed during these
attempts.

Lifecycle 1: `START PASS`, `STATUS PASS`, source/version match `YES`,
`MIXED SOURCE=False`, `STOP PASS`; active jobs `0`.

Lifecycle 2: `START PASS`, `STATUS PASS`, source/version match `YES`,
`MIXED SOURCE=False`, `STOP PASS`; active jobs `0`.

During both starts, API, Web, Judge Service, Host Agent, Supervisor, and a
registered Worker were healthy. No `HOST_CAPACITY_EXHAUSTED`, 401, binary-lock,
or application-port-residue failure recurred. Final ports 3010, 5173, 3100,
3180, 19092, and Worker health port 18080 were free. Binary exclusive-open
check passed after Stop.

Product smoke: API health 200, Web 200, Tags 200, Discussion list
(`/api/discussion/posts`) 200, Teams 200, unauthenticated Teams mine 401 as
expected.

## Validation

- Runtime focused PowerShell suites: PASS.
- Judge Service/Node/Host Agent/autoscaler focused tests: 30 PASS.
- Go Worker tests: 80 PASS.
- TypeScript typecheck: PASS.
- Build: PASS.
- Architecture gate: PASS.
- PowerShell parser: PASS.
- `git diff --check`: PASS.

## Safety

Active Judge job killed: `NO` (active count was `0` before recovery and each
Stop). Judge data mutated: `NO`. `git clean`, `git reset --hard`, force
checkout, stash drop, and broad process kill were not used. Existing dirty
`Docs/PROJECT_STATUS.md`, untracked artifacts, and existing stash were
preserved; unrelated dirty content was not staged.

## Commit

The focused code, focused test, report, and only the recovery note from
`Docs/PROJECT_STATUS.md` are committed separately from pre-existing user
changes. The status file retains its other dirty hunks.
