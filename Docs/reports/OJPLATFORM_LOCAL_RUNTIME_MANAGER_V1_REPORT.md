# OJPlatform Local Runtime Manager V1 Report

## Status

`PASS / LOCAL RUNTIME QUALIFIED`

## IMPLEMENTED

- Added `scripts/dev-runtime.ps1` with START, STOP, RESTART, STATUS, LOGS and DOCTOR commands.
- Added root BAT entry points, including `OJPlatform-Doctor.bat`.
- Added ignored `.runtime/` state, process ownership metadata, lock, generated local tokens, timings and per-service logs.
- Added checksum-verified Product/Judge migration ledger with independent migration jobs. Pending migrations are applied once; checksum drift fails closed. Forward scans explicitly exclude `.down.sql` files, and Judge DB role/database bootstrap runs before migrations.
- Added WSL Docker Compose reuse, loopback-only canonical origins, trusted Host Agent template wiring and Judge Service control-plane worker creation.
- Added `Docs/LOCAL_RUNTIME.md`, local configuration example and the canonical-manager rule to `AGENTS.md`.
- Supervisor startup now uses a named `systemd-run --user` unit with `Delegate=yes`, explicit WSL user-bus environment, and exact stale-scope recovery. This keeps runc execution under the delegated `oj-sandbox` cgroup instead of WSL init scope.
- Product API starts in parallel with Judge Service after migrations; Host Agent remains gated on Judge readiness, and Web remains gated on Worker ONLINE and API readiness.

## TESTED

- PowerShell parser: PASS.
- `node --check scripts/runtime-spawn.mjs`: PASS.
- `node --check scripts/dev-runtime-migrate.mjs`: PASS.
- `dev-runtime.ps1 status`: PASS; PostgreSQL and Judge DB connection/readiness, Redis, and MinIO readiness are reported separately.
- `dev-runtime.ps1 doctor`: correctly returned exit code `2` (`BLOCKED`) for the missing Worker binary and Supervisor compiler-rootfs identity; WSL `Ubuntu-24.04`, non-root `oj-sandbox`, `runc`, Docker, and canonical origin checks passed.
- Focused Judge Service, Host Agent, and node lifecycle tests: 24/24 passed.
- Runtime Manager `start`: PASS; infrastructure reused, both migration ledgers skipped cleanly with no pending versions, Supervisor/Host Agent-owned Worker reached `ONLINE` with `REAL_SANDBOXED_EXECUTION`, and Web/API readiness passed.
- Runtime Manager `restart`: PASS; all manager-owned services restarted without duplicate listeners.
- Runtime Manager `stop`: PASS; manager-owned services stopped through recorded ownership/control-plane paths while PostgreSQL, Redis and MinIO remained reachable.
- Stop -> Start recovery: PASS; full website returned at `http://127.0.0.1:5173`.
- Standalone real Judge qualification: PASS for AC, WA, CE, RE, TLE, MLE, cancellation, duplicate submission idempotency and generation 1 -> 2 rejudge history.
- `doctor`: PASS; WSL distro, non-root `oj-sandbox`, cgroup v2, runc, Docker infrastructure, rootfs identity/version, trusted probe, Worker source identity and canonical origin all passed.

## NOT VERIFIED / BLOCKED

- Product browser A+B was not rerun as part of this manager-only change; the existing Phase 3D real Product/browser evidence remains the applicable application-flow qualification. A fresh browser rerun is a follow-up if the local machine configuration changes.

## Architecture

The manager never launches a Worker directly. Worker creation uses Judge Service -> Host Agent -> trusted template. Stop requests the Judge Service lifecycle boundary before removing manager-owned application processes. PostgreSQL, Redis and MinIO remain running on normal Stop/Restart; `-All` is required to stop them.
