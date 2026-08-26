# Environment Baseline

This policy controls future toolchain selection without pretending that a toolchain already exists. OJPlatform currently has no initialized application frameworks or service runtime.

## Platform Policy

- Windows is an acceptable development host.
- Linux compatibility is required for production-oriented Judge and Sandbox work.
- Local development and CI must converge on compatible, recorded versions.
- Architecture-significant toolchain replacement requires deliberate review and, where appropriate, an ADR.

## Version and Dependency Policy

- Node.js will be pinned when selected.
- `pnpm` is the intended package manager and its version will be pinned when initialized.
- Go will be pinned when selected.
- PostgreSQL, Redis, and MinIO container images must use explicit versions, never a floating `latest` tag.
- Dependency lockfiles are committed once package management is initialized.
- Docker and Docker Compose versions should be recorded when environment initialization occurs.

`.env.example` may contain variable names and safe default placeholders only. Secrets remain outside source control.

## Unresolved Version Decisions

The following will be selected and recorded during the repository/toolchain foundation phase, based on then-current compatibility, support, security, and project requirements:

- Node.js release line and exact pinning mechanism.
- `pnpm` release and pinning mechanism.
- Go release line and pinning mechanism.
- PostgreSQL, Redis, and MinIO image versions.
- Docker and Docker Compose compatibility baseline.
- The files and automation that enforce version parity between local development and CI.

No version number in this document is a final selection, and this policy does not authorize dependency installation or service initialization.
