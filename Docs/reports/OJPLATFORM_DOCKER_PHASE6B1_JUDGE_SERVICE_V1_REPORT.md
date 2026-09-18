# Docker Phase 6B-1 Judge Service Report

## Live Baseline

- Canonical root: `D:\OJPlatform`
- Feature worktree: `D:\OJPlatform-worktrees\docker-phase6b1-judge-service-v1`
- Branch: `codex/docker-phase6b1-judge-service-v1`
- Start commit and live `main`: `5a76066b3559abbac152004281d074d9ce7b4d86`
- Canonical root was clean. Existing stashes and worktrees were preserved.
- Phase 6A architecture was treated as binding.

## Files Changed

- Added `Dockerfile.judge-service`.
- Added Judge Service and Judge migration container build scripts and runtime dependency declarations.
- Added dependency-specific readiness and `_FILE` support for Judge runtime secrets.
- Added the Compose `judge` profile, migration gates, loopback host bridge, and production/dev policy.
- Added focused container-contract tests and updated deployment/status/handoff documentation.

## Judge Service Build

`Dockerfile.judge-service` uses pinned Node `22.20.0-alpine` and pnpm `11.19.0`. The build bundles OJPlatform workspace code and carries only the production npm dependency closure needed by the generated entrypoints. Separate `migration` and `runtime` targets prevent migration scripts from entering the long-lived runtime image.

The documented repository-root build context works. No machine-specific path is present.

## Runtime Image

The `linux/amd64` runtime image built successfully. Inspected size was 58,470,270 bytes. It contains the Node runtime, production dependency closure, and generated Judge Service entrypoint. It contains no migration scripts, compiler rootfs, runc, Docker CLI, Docker socket, or submission execution implementation.

The migration target contains only the production dependency closure, generated Judge bootstrap/migration entrypoints, and Judge migration SQL.

## Runtime User

Running-container evidence:

```text
uid=100(ojplatform) gid=101(ojplatform) groups=101(ojplatform)
Config.User=ojplatform
```

Both image targets run as the dedicated non-root user.

## Security Posture

Runtime inspection confirmed:

- read-only root filesystem: `true`;
- writable storage: `/tmp` tmpfs only;
- `no-new-privileges`: enabled and `NoNewPrivs: 1`;
- `cap_drop: ALL` and `CapEff: 0000000000000000`;
- privileged: `false`;
- no host PID or host network;
- no devices, host mounts, compiler rootfs, runc, Docker CLI, or Docker socket.

No capability exception was required.

## Judge DB

Compose uses three separate contracts:

- `JUDGE_DATABASE_ADMIN_URL` for idempotent database/role bootstrap;
- `JUDGE_MIGRATION_DATABASE_URL` for schema migration owner access;
- `JUDGE_RUNTIME_DATABASE_URL`, mapped to `JUDGE_DATABASE_URL` only in Judge Service.

The long-lived container environment contained `JUDGE_DATABASE_URL` but no `DATABASE_URL`, admin URL, or migration URL. Controlled PostgreSQL inspection showed the runtime role was not superuser, could not create databases or roles, and lacked `CREATE` on schema `public`.

## Judge Migration Gate

Compose ordering is:

```text
postgres healthy
  -> judge-bootstrap completed successfully
  -> migrate-judge completed successfully
  -> judge-service starts
```

Redis health is also required before Judge Service starts. No blind sleep or service-owned automatic schema mutation was added.

## Redis

Judge Service uses `redis://redis:6379` and the existing Judge key prefix. Dependency loss made `/ready` return 503 while `/health` remained 200.

Redis ACL hardening remains open. Successful connectivity does not resolve the shared ACL-less service-mode Worker production blocker.

## Artifact / MinIO Boundary

Judge Service does not directly access MinIO and receives no S3/MinIO credential. Product API remains the artifact authorization boundary. No artifact credential reaches the Judge Service container or any sandbox.

## Credentials

Runtime-injected environment values provide the Judge DB URL and distinct service/node tokens. The implementation also accepts mutually exclusive `_FILE` sources for Judge DB, Redis, service-token, and node-token settings. No secret value is committed, baked into an image layer, or recorded in image history.

Inspection/reporting used environment names only; values remained redacted. Judge Service receives no Product DB, migration-owner, bootstrap-admin, or MinIO credential.

## Health / Readiness

- `/health`: unauthenticated process liveness; remained 200 during Redis loss.
- `/ready`: unauthenticated dependency readiness; returns separate Judge DB and Redis status and fails closed with 503.
- Readiness does not claim runc, compiler rootfs, Supervisor, Worker, or execution capacity.

Fresh controlled runtime returned 200 from both endpoints. Redis outage returned Judge DB `ok`, Redis `unavailable`, and HTTP 503 from `/ready`.

## Compose Judge Profile

`docker compose --profile judge ...` enables exactly:

- `judge-bootstrap`;
- `migrate-judge`;
- `judge-service`.

Worker, Host Agent, and Supervisor are absent. Core rendering without the profile excludes all Judge services.

## Product API Connectivity

Product API receives `JUDGE_SERVICE_URL=http://judge-service:3100` and the existing Judge service token contract. A running API container reached authenticated `/v1/capabilities` through Compose DNS with HTTP 200. No localhost or parallel API configuration was introduced inside Compose.

## Host Execution Cell Compatibility

Development and production overlays publish Judge Service only on `127.0.0.1:${OJPLATFORM_JUDGE_SERVICE_PORT}`. A controlled loopback request reached `/health` and `/ready`. A dedicated `judge-host` bridge permits host port forwarding while PostgreSQL and Redis remain on the internal infrastructure network.

Worker, Host Agent, and Supervisor remain host-native. Worker-to-Supervisor `127.0.0.1:19092` was not changed. Host Agent is optional; Judge Service can operate with static/manual Worker mode.

## Network Exposure

Production rendering publishes Web on its existing ingress and Judge Service on host loopback only. Judge Service is not an internet ingress. API, PostgreSQL, Redis, and MinIO receive no new public ports. Judge Service uses the internal infrastructure network for API/DB/Redis and the dedicated host-forwarding bridge only for loopback publication.

## Fresh Startup

An isolated Compose project and fresh volume successfully completed bootstrap, all Judge migrations, Judge Service startup, `/health`, and `/ready`. No user database or shared volume was used.

## Second Startup

After removing only the isolated one-shot/service containers and preserving the isolated DB volume, bootstrap reran safely, migration reported `Migration judge up to date`, and Judge Service returned healthy. No duplicate migration or schema collision occurred.

## Migration Failure Gate

A separate isolated project intentionally supplied the runtime Judge role as migration owner. Migration failed with `JUDGE_MIGRATION_ROLE_MUST_DIFFER_FROM_RUNTIME_ROLE`; Compose returned nonzero and Judge Service remained in `created` state rather than starting or becoming ready.

## Core Regression

Core rendered without `judge` contains only the existing Core services. An isolated no-profile startup using existing Core images reached healthy API and Web; running services were API, Web, PostgreSQL, Redis, and MinIO only.

## Judge Tests

- Focused Judge and migration suite: 52 passed, 0 failed, 5 intentionally skipped integration cases.
- Focused ESLint: passed.
- Root TypeScript typecheck: passed.
- Judge Service and migration container entrypoint builds: passed.
- `git diff --check`: passed before documentation finalization and rerun in final validation.

## Docker Inspect Evidence

Running Judge Service inspection confirmed non-root identity, read-only rootfs, `/tmp` tmpfs, all capabilities dropped, no-new-privileges, ordinary bridge networking, no host PID/network, no privileged mode, and no Docker socket mount.

Environment-name inspection showed only Node metadata plus Judge DB, Judge Redis, service/node tokens, host, port, and prefix. Product DB, migration/admin DB, MinIO/S3, Docker, runc, rootfs, and Supervisor settings were absent.

## Multi-Arch Status

- Judge Service image `linux/amd64`: built and runtime-validated.
- Judge Service image `linux/arm64`: build attempted but not verified; Docker Hub authentication metadata fetch failed with a machine-local BuildKit TLS handshake timeout. No repository networking workaround was committed.
- Full Judge `linux/arm64`: `NOT QUALIFIED` regardless of control-plane image portability.

## HIGH Blockers

1. `oj-sandbox` Docker-group membership: **OPEN**.
2. Shared ACL-less Redis access by service-mode Worker: **OPEN**.

Both continue to block production Judge qualification.

## Known Baseline Debt

Unrelated `/blog` behavior, `SubmissionHistoryPage` fixture debt, historical formatting/lint debt, and generic Supervisor baseline tests were not changed.

## Handoff Compression

`Docs/OJPLATFORM_CURRENT_HANDOFF.md` was compressed while preserving Phase 5 Mac deferral, Phase 6A status, Phase 6B-1 result, both HIGH blockers, critical boundaries, next action, and required model.

## Risks

- Production execution-cell security regression has not been rerun.
- Worker still directly uses shared Redis in service mode.
- Dedicated production Linux amd64 execution-host qualification remains pending.
- Judge Service arm64 image runtime is not verified.
- Environment injection remains the current Compose secret transport; operators must use protected deployment configuration or the supported `_FILE` contract for Judge Service runtime secrets.

## Commit

Feature branch: `codex/docker-phase6b1-judge-service-v1`.

Planned commit message: `feat: containerize judge service control plane`.

Main merge was not performed.

## Next Phase

Proceed to Phase 6B-2: retain host-native Worker, remove direct Redis use from service mode or add dedicated ACL isolation, preserve Supervisor loopback, and keep both HIGH blockers explicit until independently resolved and tested.

```text
JUDGE CONTROL PLANE DOCKER = PASS
PRODUCTION JUDGE QUALIFIED = NO
REAL SUBMISSION EXECUTED = NO
```
