# OJPlatform PHASE 0B.2 Application Platform & CI Report

## Goal / Scope

Create and qualify the first executable React/Vite Web and Fastify API platform with local CI-equivalent gates, runtime lifecycle checks, browser smoke coverage, and no OJ business features.

## Status

PASS.

## Lineage and Node Runtime

Starting HEAD: `73889e40d856a89c9daa68b50b696c98c8b9e475`. Previous 0B.1 content commit `1fd27f035fc584afedc2b6dbb212266fa0d9e238` is in the current ancestry. Canonical development/CI policy is Node `>=22.20.0 <25`; system Node is `v22.20.0`, while pnpm sessions use a compatible fallback Node `v24.19.0`. pnpm is pinned to `11.19.0`; CI config uses Node `22.20.0` and pnpm `11.19.0`.

## Web Foundation

React `19.2.8`, Vite `8.2.2`, and `@vitejs/plugin-react` `6.1.0` provide a real buildable shell. `/` renders title and API health loading/ready/error states; unknown client paths render controlled not-found UI. API calls are behind `src/services/platform.ts`; a real top-level React error boundary catches render failures. Web tests: 4 passing component/state/error-boundary tests; production build and preview succeeded.

## API Foundation

Fastify `5.12.1` with CORS `11.3.0`, TypeBox schemas, and Swagger `9.8.1` provides `/health`, `/ready`, `/openapi.json`, bounded request IDs, structured logging, stable `{ code, message, requestId }` errors, typed PORT validation, and SIGINT/SIGTERM graceful shutdown. `/ready` reports only currently existing dependencies; no database/Redis/MinIO is pretended.

API tests cover health/readiness, request IDs and oversized/malformed input replacement, controlled 404, internal-error redaction, OpenAPI paths, and clean close. API package build passed.

## Runtime Qualification

- API real start/health/ready/404/request ID: PASS.
- API graceful shutdown, port release, same-port restart, second shutdown/no orphan: PASS in two automated rounds via `pnpm runtime:smoke`.
- Web production build and Vite preview root serving: PASS; browser preview used by E2E.
- Browser E2E with installed system Chrome: PASS; shell visible, healthy API state visible, not-found route controlled, no page errors.
- OpenAPI `/health` and `/ready`: PASS in generated document and `/openapi.json` endpoint.

## Negative Qualification

- Invalid `PORT=not-a-port`: `FAIL_AS_EXPECTED`, startup exited non-zero with explicit validation error.
- Web -> API internal architecture violation: `FAIL_AS_EXPECTED`, architecture gate rejects the dedicated fixture (alongside plugin -> Core internal case).
- Internal error leak: PASS; HTTP 500 stable contract includes request ID and no stack/path text.

## CI and Reproducibility

`.github/workflows/ci.yml` checks out, configures canonical Node/pnpm, installs with `--frozen-lockfile`, and runs `pnpm ci:check`. Workflow formatting/config references were locally validated; `REMOTE CI OBSERVED = NO`. `pnpm install --frozen-lockfile`, `pnpm ci:check`, and the full regression sequence all passed twice; Vitest reported 9/9 tests; no unexpected lockfile/source mutation or owned orphan processes remain.

## Scope and Security

```text
BUSINESS FEATURES IMPLEMENTED = NO
DATABASE / REDIS / MINIO IMPLEMENTED = NO
JUDGE / SANDBOX / PLUGIN RUNTIME IMPLEMENTED = NO
```

No Architecture Baseline boundary was weakened and no secrets were introduced. Playwright is configured to use an existing local Chrome executable; CI browser execution is intentionally not included yet.

## Files and Git

The implementation adds the Web/API source, tests, runtime scripts, Playwright configuration/E2E, CI workflow, package metadata/lockfile updates, and this report; it updates `CONTRIBUTING.md`, `Docs/ENVIRONMENT_BASELINE.md`, and `Docs/PROJECT_STATUS.md`. User-provided `Goals/` ZIP files remain untracked and protected.

Primary implementation commit: `c906dcc` (`feat: establish executable web api platform and ci foundation`).

## Known Limitations / Follow-ups

No remote GitHub Actions run was observed. CI browser E2E remains a follow-up; future Goals should add service-specific tests and preserve the security gates before introducing business domains.
