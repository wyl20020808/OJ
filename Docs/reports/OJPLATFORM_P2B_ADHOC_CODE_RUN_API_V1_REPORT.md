# OJPlatform P2B Ad-hoc Code Run API V1

Status: PARTIAL

BASE: `2e60b33` (`fix: stabilize local runtime identity and infra config`)

## Implementation

- `POST /api/code-runs` accepts only `cpp20`, bounded source (256 KiB), and bounded stdin (64 KiB); it requires the existing session/auth context and CSRF double-submit token.
- `GET /api/code-runs/:runId` polls the Judge job and returns the bounded public result projection.
- Product creates a temporary `REAL_SANDBOXED_EXECUTION` Judge job with ad-hoc linkage and caller stdin. No Submission, Evaluation, hidden JudgeDataVersion, hidden testcase, or formal verdict is created.
- Execution path remains Product API -> existing Judge Service -> existing queue/Worker -> Supervisor -> Sandbox.
- Judge Service projection adds bounded ad-hoc stdout/stderr/diagnostics and status translation. Official Submission projection remains unchanged.

## Evidence

- Focused tests: `tests/code-run-api.test.ts`, 4 passed. Covers validation, CSRF/auth route behavior, ad-hoc linkage isolation, and status translation.
- API typecheck/build: PASS (`pnpm --filter @ojplatform/api build`).
- `git diff --check`: PASS.
- Judge Service package build: BLOCKED by pre-existing workspace `rootDir` errors that pull sibling workspace sources into `apps/judge-service/tsconfig.json`; no runtime code was changed to bypass this.
- Real A+B run: NOT VERIFIED. `scripts/dev-runtime.ps1 status` reported PostgreSQL, Judge DB, Redis, MinIO, Judge Service, Worker, Supervisor, and Host Agent DOWN.

FINAL COMMIT: pending
