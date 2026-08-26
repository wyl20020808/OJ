# OJPlatform PHASE 0B.1 Engineering Foundation Report

## Goal / Scope

Create a reproducible TypeScript/pnpm monorepo with strict typing, lint, formatting, tests, architecture dependency checks, and build gates without OJ business implementation.

## Status

PASS.

## Starting HEAD / Environment

Starting HEAD: `cffcf6cd95e4d48cdae10993e1c370fc1598991b`.
Node: `v24.19.0`; pnpm: `11.19.0`; npm: available; Git: `2.51.0.windows.2`; Go: NOT FOUND; Docker: NOT FOUND; Docker Compose: NOT FOUND; WSL/Linux: NOT VERIFIED.

## Workspace

Root is private and pins `packageManager: pnpm@11.19.0` with Node policy `>=24.19.0 <25`. `pnpm-workspace.yaml`, `pnpm-lock.yaml`, strict root TypeScript configs, ESLint, Prettier, Vitest, and root scripts are present.

Packages: `@ojplatform/contracts`, `@ojplatform/core`, `@ojplatform/judge-protocol`, `@ojplatform/plugin-sdk`, `@ojplatform/test-utils`, `@ojplatform/api`, and `@ojplatform/web`. The API/Web packages are metadata/boundary skeletons only.

## Positive Validation

All commands returned exit code 0 on the final state:

```text
pnpm install = PASS
pnpm format:check = PASS
pnpm lint = PASS
pnpm typecheck = PASS
pnpm test = PASS (1 file, 2 tests)
pnpm test:architecture = PASS (allowed fixture plus 2 forbidden cases detected)
pnpm build = PASS
pnpm check = PASS
```

## Negative Qualification

- TYPECHECK NEGATIVE = `FAIL_AS_EXPECTED`; temporary number-to-string error returned non-zero with TS2322, then removed and final typecheck passed.
- LINT NEGATIVE = `FAIL_AS_EXPECTED`; temporary unused variable returned non-zero from `@typescript-eslint/no-unused-vars`, then removed and final lint passed.
- FORMAT NEGATIVE = `FAIL_AS_EXPECTED`; temporary unformatted file returned non-zero from Prettier, then removed and final format check passed.
- ARCHITECTURE NEGATIVE CASE 1 = `FAIL_AS_EXPECTED`; plugin -> Core import detected.
- ARCHITECTURE NEGATIVE CASE 2 = `FAIL_AS_EXPECTED`; web -> API internal import detected.

Architecture fixtures are committed as controlled tests; temporary type/lint/format files were not committed.

## Second-Pass / Reproducibility

`pnpm install --frozen-lockfile = PASS` and a second `pnpm check = PASS`. Lockfile and source did not change unexpectedly. Build output is ignored generated material; no qualification files or unexplained junk remain.

## Architecture / Security Impact

The lightweight gate enforces documented dependency direction without selecting a future service topology. Judge Worker -> Application DB and Plugin -> Core internals remain prohibited. No security boundary was weakened.

## Scope Status

```text
BUSINESS FEATURES IMPLEMENTED = NO
DATABASE IMPLEMENTED = NO
REDIS IMPLEMENTED = NO
MINIO IMPLEMENTED = NO
JUDGE IMPLEMENTED = NO
SANDBOX IMPLEMENTED = NO
PLUGIN RUNTIME IMPLEMENTED = NO
CI IMPLEMENTED = NO
```

## Known Limitations / Follow-ups

Go, Docker, WSL/Linux, and Sandbox primitives are not qualified. Architecture checks currently cover foundation fixtures and should expand with real packages as they appear. CI integration and application framework skeletons belong to later Goals.

## Git / Commit

The permanent report and project status are included in this Goal. Engineering foundation content commit: `1fd27f035fc584afedc2b6dbb212266fa0d9e238` (`build: establish TypeScript monorepo engineering foundation`). A later metadata-only correction may follow; the user-provided `Goals/` ZIP remains untracked and protected.
