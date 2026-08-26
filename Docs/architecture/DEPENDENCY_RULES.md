# Dependency Rules

These rules translate the [Architecture Baseline](../OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md) into future package dependency direction. This Goal creates no enforcement tooling.

## Intended Direction

```text
apps/web
  -> public contracts / API client

apps/api
  -> domain/application packages
  -> infrastructure through defined adapters

apps/judge-worker
  -> judge protocol
  -> sandbox client
  X application database

plugins/*
  -> plugin-sdk
  -> explicitly exposed public contracts
  X core internals

core/domain modules
  X concrete plugins
```

## Rules

- `internal` paths are not public APIs.
- Package dependencies MUST NOT form cycles.
- Repositories are module internals unless explicitly exported as a deliberate public contract.
- Cross-module direct database-table manipulation is prohibited; use public services, contracts, commands, queries, or events.
- High-level packages must not depend on UI packages.
- Public contracts should avoid leaking infrastructure-specific types.
- Exceptions require explicit review and may require an ADR.

Future architecture tests and CI should enforce these rules mechanically once the package layout exists.
