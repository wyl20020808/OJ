# OJPlatform Local Runtime Infrastructure Stabilization V1

Status: PARTIAL

## Implemented

- Added WSL `Ubuntu-24.04` and WSL-native Docker/Compose preflight.
- Fixed canonical Compose project identity to `ojplatform-local` for every
  Runtime Manager invocation.
- Added per-service inspection for container state, health, published mapping,
  canonical network, and Windows host reachability.
- Added targeted `--force-recreate` for stale service configuration only.
- Added specific readiness failure codes and persistent infrastructure log.
- Preserved named PostgreSQL, Redis, and MinIO volumes; no prune/down cleanup
  is performed during failed application startup.
- Added a Runtime Manager-owned WSL keepalive marker so WSL-native Docker does
  not exit solely because the initiating `wsl.exe` command completed.
- Fixed Host Agent template environment serialization to always emit a JSON
  array.

## Evidence

- WSL distro: `Ubuntu-24.04` (WSL2), initially stopped.
- Docker Engine: 29.7.2, active in Ubuntu; Compose v5.5.0.
- Compose project: `ojplatform-local`.
- Existing containers used named volumes and canonical network.
- Redis stale published mapping was detected and recreated individually.
- PostgreSQL, Redis, and MinIO reached healthy state with ports 55432, 56379,
  and 59000 reachable during reconciliation.

## Blocker

Full application startup remains unverified because port 3180 is occupied by an
unidentified pre-existing Node process. Runtime Manager correctly refuses to
kill or replace an unowned listener. The process returned HTTP 401 for the
current Host Agent token and must be resolved by an operator before complete
application validation.

## Files

- `scripts/dev-runtime.ps1`
- `config/dev-runtime.local.ps1.example`
- `Docs/LOCAL_RUNTIME.md`
