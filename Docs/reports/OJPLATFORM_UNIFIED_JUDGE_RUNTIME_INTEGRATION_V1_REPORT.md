# OJPlatform Unified Judge Runtime Integration V1 Report

## Result

`UNIFIED JUDGE RUNTIME INTEGRATION = PASS`.

The formal history-preserving merge, executable integration gates, and the required bounded fresh integrated Browser/Product runtime qualification completed on the current unified source tree.

## Git Evidence

- Product/Web HEAD: `4df8c2c08d6e651a8e57057f60ba9a3b762a975d` (`feat: polish problem and evaluation web UI`).
- 2C.8D HEAD: `4462fbd8ae85ac82b327a7b642a96d4f761245c7` (`fix: preserve workers across host agent restart`).
- Merge base: `e8b1db6298d5800ca8a45de39b8231a9f4373c4b`.
- Merge commit: `d4e04ca` (`merge: integrate phase 2C.8D judge runtime infrastructure`).
- Both source HEADs are ancestors of the merge commit. Git completed the merge without text conflicts; no manual file transfer was used.

## Reconciliation

- The integrated Judge Service contains the existing job intake, scheduler, cancellation/rejudge generation semantics, authoritative verdict projection and 3D.1 safe detail support together with 2C.8D pool policy, lifecycle, capacity and autoscaler behavior.
- Submission/Detail keeps the later 3D/3D.1 authority: exact immutable JudgeDataVersion binding, Product-only retrieval bridge, guarded terminal publication, selected-generation durable detail, and bounded scrubbed CE diagnostics.
- Host Agent/Pool keeps the 2C.8D authority: trusted templates only, desired/observed state, control version, capacity reservation, MANUAL/AUTOMATIC policy, drain-stop lifecycle, detached/unref Worker spawning, and fail-closed persisted PID reconciliation. A replacement Agent neither adopts nor kills unverifiable persisted ownership.
- Product Judge Admin and the Web Judge Machines surface retain Product-only RBAC/CSRF/idempotency/audit controls. Browser code does not receive Host Agent or Judge credentials.
- No global evaluation-list backend or explicit problem capability projection was implemented.

## Tested

- Focused Judge/Admin/Host Agent/Pool/Submission/Detail: 55 passed.
- Focused Web regression: 23 passed.
- `pnpm test`: 772 passed, 5 existing opt-in skips (including the private-author submission regression added during this qualification).
- `pnpm test:web`: 11 passed.
- `pnpm integration`: 9 passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:architecture`, `pnpm build`, `pnpm build:web`, and `git diff --check`: PASS.
- `go test ./...` in Judge Worker: PASS.
- `go test ./...` in Sandbox Supervisor: PASS in WSL Linux.
- Native Windows Sandbox Supervisor `go test ./...`: BLOCKED by Linux-only syscall/rootless-cgroup tests; this is not counted as a PASS. The required Linux execution is the passing evidence.
- Product DB migration: PASS.
- Fresh independent Judge DB bootstrap/migration: PASS.

## Runtime Qualification

`RUNTIME VERIFIED (current integrated source)`: isolated Product and Judge
databases plus Redis prefix `oj:unified-runtime:20260902` used a current-source
Supervisor at `127.0.0.1:19204` running as non-root `oj-sandbox`, current-source
standalone Judge Service at `127.0.0.1:3210`, and current-source Host Agent at
`127.0.0.1:3218`. Judge Service Add Node selected the fixed trusted C++20
template; the Host Agent created Worker node
`cpp20-gcc-13-v1-1788359772578-1` (incarnation
`ac0fbea6-5e25-442f-98c9-91899d5413e4`). The registered node reported
`desiredState=ONLINE`, `observedState=ONLINE`, healthy heartbeat,
`cpp20-gcc-13-v1`, and `REAL_SANDBOXED_EXECUTION`.

The authorized local Browser smoke used Guest `游客 C4F0888B` to create the
private `Unified Runtime A+B` problem
`unified-runtime-ab-20260902` (`da411013-32da-470a-9bdf-cfc4a75b0de4`), upload
the real `1 2` / `3` testcase, validate it, and publish immutable Judge Data
v1. Product was restarted from the current unified source after correcting the
private-author submission composition defect; the added regression test covers
that exact authorization boundary.

- AC submission `24affb4f-92af-424b-9dc2-161610938c07`: Browser/Product ->
  Judge Service -> Scheduler -> Host-Agent-owned Worker -> Supervisor ->
  Sandbox -> Product projected `AC`. Browser Submission Detail showed
  Generation 1, testcase `#1 AC`, `253 ms`, and no memory fact provided.
- WA submission `598a0092-858d-4af8-ad3c-890bae9ed11e`: the same formal path
  projected `WA`. Browser Submission Detail showed Generation 1, testcase
  `#1 WA`, `47 ms`, and `4.5 MB`.

The standalone direct Judge matrix also passed AC, WA, CE, RE, TLE, MLE,
duplicate dispatch, cancellation, and rejudge history through the same Worker
and Supervisor chain. Historical runtime records were not used as evidence for
this merge.

## Auth Real-Runtime Remediation Addendum

The current Product API runtime was requalified from the unified source after
the Guest identity/session fix. Its configured Product database is
`ojplatform_product_unified_runtime_20260902`; that database contained three
active Guest users, no `root` username, no `2846547486@qq.com` email, and no
password credentials. The reported root email 401 therefore has a confirmed
root cause of Product API/database mismatch or missing account in the active
runtime database. No root password or credential was reset.

Password diagnostics now record only identifier type, redacted normalized
identifier, user/status presence, password-login enablement, credential
presence, non-secret scrypt metadata, verifier outcome, request ID, and the
runtime database name. Passwords, hashes, peppers, secrets, and session tokens
are never logged. A real temporary account on this Product API registered with
the current writer (`201`), logged in with the correct password (`200`), and
returned the generic `Invalid credentials` response for a wrong password
(`401`); the account was deleted afterward. `ROOT PASSWORD CREDENTIAL STATUS`
remains `UNKNOWN` because the target account is absent from the active Product
database.

Guest durable identity now survives session expiry, API restart, stale legacy
resume cookies, and concurrent continue calls without normal token rotation.
The Browser smoke on canonical `http://127.0.0.1:5173` observed Guest A,
session-cookie removal -> Guest A, stale-cookie recovery -> Guest A, and a new
browser context -> distinct Guest B, all with `200`. Web proxy, API host,
cookies, CSRF, and runtime startup consistently use `127.0.0.1`; no
`localhost:5173` split was found. Focused Auth/Guest tests passed 25/25,
full unit tests passed 779 with 5 existing skips, integration passed 9/9, and
all type/lint/format/build/architecture gates passed. The Product Lead Browser
smoke was corrected to send the existing CSRF header and passed 1/1; the
companion Web UI smoke passed 1/1. The complete legacy E2E collection still
has seven unrelated historical failures in Phase 1/admin shell fixtures (and
13 opt-in skips), so those are recorded as test debt rather than auth/runtime
failures.

`PASSWORD AUTH VERIFIER = PASS`

`ROOT LOGIN 401 ROOT CAUSE = active Product API database has no target root/email account`

`ROOT PASSWORD CREDENTIAL STATUS = UNKNOWN`

`SAME BROWSER SAME GUEST = PASS`

`SESSION EXPIRY PRESERVES GUEST = PASS`

`STALE COOKIE 401 LOOP = FIXED`

`CANONICAL LOCAL WEB ORIGIN = http://127.0.0.1:5173`

`localhost/127.0.0.1 SPLIT FOUND = NO`

`AUTH REGRESSION = PASS`

## Status

`CODE EXISTS`: YES.

`FEATURE IMPLEMENTED`: YES, via formal merge.

`FEATURE TESTED`: YES for the listed automated, build and migration gates.

`FEATURE RUNTIME QUALIFIED`: YES for the bounded local integration scope.

`PRODUCTION READY`: NO.
