# Environment Baseline

This policy controls toolchain selection. The repository/tooling foundation is now initialized; application frameworks and service runtime are still absent.

## Platform Policy

- Windows is an acceptable development host.
- Linux compatibility is required for production-oriented Judge and Sandbox work.
- Local development and CI must converge on compatible, recorded versions.
- Architecture-significant toolchain replacement requires deliberate review and, where appropriate, an ADR.

## Verified Foundation (2026-08-26)

- Node.js: VERIFIED `v22.20.0` from `C:\Program Files\nodejs\node.exe`; pnpm command sessions also report fallback runtime `v24.19.0`. Project policy is the tested compatibility range `>=22.20.0 <25` until runtime selection is unified.
- pnpm: VERIFIED `11.19.0`; pinned by the root `packageManager` field.
- npm: VERIFIED during preflight; no npm lockfile is used.
- Git: VERIFIED `2.51.0.windows.2`.
- Go: NOT INSTALLED; not required for this TypeScript foundation.
- Docker Desktop: officially uninstalled during PHASE 0B.3R2 fallback; WSL Docker Engine is the intended backend.
- Docker CLI: VERIFIED `29.7.2`; Docker Compose plugin VERIFIED `v5.4.0`; `docker version/info` and `hello-world` remain blocked until the daemon starts.
- WSL: WSL `2.7.12` is installed and Ubuntu `24.04` registration was observed in WSL2 mode, but post-uninstall WSL commands timed out and shell initialization is not qualified. Docker Engine installation is blocked pending WSL recovery/reboot.
- WSL / Linux sandbox primitives: NOT VERIFIED; WSL runtime recovery/reboot required before Docker Engine qualification.

## Version and Dependency Policy

- Node.js will be pinned when selected.
- `pnpm` is the intended package manager and its version will be pinned when initialized.
- Go will be pinned when selected.
- PostgreSQL, Redis, and MinIO container images must use explicit versions, never a floating `latest` tag.
- Dependency lockfiles are committed once package management is initialized.
- Docker and Docker Compose versions are recorded above; backend and container qualification remain pending reboot.

`.env.example` may contain variable names and safe default placeholders only. Secrets remain outside source control.

## Unresolved Version Decisions

The following will be selected and recorded during the repository/toolchain foundation phase, based on then-current compatibility, support, security, and project requirements:

- Node.js release line and exact pinning mechanism.
- `pnpm` release and pinning mechanism.
- Go release line and pinning mechanism.
- PostgreSQL, Redis, and MinIO image versions.
- Docker and Docker Compose compatibility baseline.
- The files and automation that enforce version parity between local development and CI.

Node and pnpm selections above are now selected for the repository foundation. Go, container, Linux, and CI decisions remain unresolved. This document does not authorize service implementation.
