# OJPlatform Unified Judge Runtime Integration V1 Report

## Result

`UNIFIED JUDGE RUNTIME INTEGRATION = PARTIAL`.

The formal history-preserving merge and all executable integration gates completed. The required bounded fresh integrated runtime qualification, including Host-Agent-owned Worker ONLINE and Product/browser AC plus WA, was not run in this session and is therefore not claimed.

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
- `pnpm test`: 771 passed, 5 existing opt-in skips.
- `pnpm test:web`: 11 passed.
- `pnpm integration`: 9 passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:architecture`, `pnpm build`, `pnpm build:web`, and `git diff --check`: PASS.
- `go test ./...` in Judge Worker: PASS.
- `go test ./...` in Sandbox Supervisor: PASS in WSL Linux.
- Native Windows Sandbox Supervisor `go test ./...`: BLOCKED by Linux-only syscall/rootless-cgroup tests; this is not counted as a PASS. The required Linux execution is the passing evidence.
- Product DB migration: PASS.
- Fresh independent Judge DB bootstrap/migration: PASS.

## Runtime Qualification

`RUNTIME VERIFIED (current integrated source, direct Judge path)`: an isolated
Judge DB and Redis prefix used a current-source Supervisor running as the
non-root `oj-sandbox` identity, current-source Judge Service, and current-source
Host Agent. Judge Service Add Node selected the fixed trusted C++20 template;
the Host Agent created the Worker. The registered node reported
`desiredState=ONLINE`, `observedState=ONLINE`, a healthy heartbeat,
`cpp20-gcc-13-v1`, and `REAL_SANDBOXED_EXECUTION`. A real standalone Judge
runtime matrix then passed AC, WA, CE, RE, TLE, MLE, duplicate dispatch,
cancellation, and rejudge history through Judge Service -> Scheduler ->
Host-Agent-owned Worker -> Supervisor -> Sandbox. The Worker was stopped by
the Judge Service lifecycle API before Goal-owned services were terminated.

`NOT VERIFIED`: the remaining required current-source Browser/Product smoke:
Guest creation, private A+B authoring, Judge Data upload/validation/publication,
Product AC and WA submission, and browser Submission Detail per-testcase rows.
This session requested the required browser action-time confirmation before
creating the local test Guest account, but confirmation was not received.
Historical Phase 2C.8D and 3D/3D.1 browser/runtime records were not reused as
evidence for this merge.

## Status

`CODE EXISTS`: YES.

`FEATURE IMPLEMENTED`: YES, via formal merge.

`FEATURE TESTED`: YES for the listed automated, build and migration gates.

`FEATURE RUNTIME QUALIFIED`: NO for this newly unified source tree.

`PRODUCTION READY`: NO.
