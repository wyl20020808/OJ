# OJPlatform Local Runtime Manager V1 Report

## Status

`PARTIAL / IMPLEMENTED_NOT_RUNTIME_QUALIFIED`

## IMPLEMENTED

- Added `scripts/dev-runtime.ps1` with START, STOP, RESTART, STATUS, LOGS and DOCTOR commands.
- Added root BAT entry points, including `OJPlatform-Doctor.bat`.
- Added ignored `.runtime/` state, process ownership metadata, lock, generated local tokens, timings and per-service logs.
- Added checksum-verified Product/Judge migration ledger with independent migration jobs. Pending migrations are applied once; checksum drift fails closed. Forward scans explicitly exclude `.down.sql` files, and Judge DB role/database bootstrap runs before migrations.
- Added WSL Docker Compose reuse, loopback-only canonical origins, trusted Host Agent template wiring and Judge Service control-plane worker creation.
- Added `Docs/LOCAL_RUNTIME.md`, local configuration example and the canonical-manager rule to `AGENTS.md`.

## TESTED

- PowerShell parser: PASS.
- `node --check scripts/runtime-spawn.mjs`: PASS.
- `node --check scripts/dev-runtime-migrate.mjs`: PASS.
- `dev-runtime.ps1 status`: PASS; PostgreSQL and Judge DB connection/readiness, Redis, and MinIO readiness are reported separately.
- `dev-runtime.ps1 doctor`: correctly returned exit code `2` (`BLOCKED`) for the missing Worker binary and Supervisor compiler-rootfs identity; WSL `Ubuntu-24.04`, non-root `oj-sandbox`, `runc`, Docker, and canonical origin checks passed.
- Focused Judge Service, Host Agent, and node lifecycle tests: 24/24 passed.

## NOT VERIFIED / BLOCKED

- Full Start/Restart/Stop and A+B real submission cannot be runtime-qualified until machine-local Supervisor, trusted probe, verified C++20 compiler rootfs identity and Host-Agent-owned Worker binary are supplied in ignored `config/dev-runtime.local.ps1`.
- Browser qualification, timing measurements, complete Start/Restart/Stop, and A+B runtime evidence are not claimed in this report.

## Architecture

The manager never launches a Worker directly. Worker creation uses Judge Service -> Host Agent -> trusted template. Stop requests the Judge Service lifecycle boundary before removing manager-owned application processes. PostgreSQL, Redis and MinIO remain running on normal Stop/Restart; `-All` is required to stop them.
