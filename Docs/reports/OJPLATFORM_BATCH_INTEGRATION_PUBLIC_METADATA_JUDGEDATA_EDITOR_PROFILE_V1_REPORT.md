# OJPlatform Batch Integration V1 Report

Status: PARTIAL

## Integration

- Starting main: `e3dbd68ccd72af451f77fe7994e684904929a15a`
- Runtime stabilization: ALREADY PRESENT (HEAD ancestor)
- Public metadata: merged `1e49f4aa048c223f243574581353298faa6e9254`
- JudgeData 100 MiB: merged `26e69e9e47fc5dcd9a1dbd72a37ea6db5f44bb7e`
- Profile UI cleanup: merged `7084d53ac70a89fc1650dc1fdd6f51d11c086c17`
- OnlineCodeEditor source: independent repository `666a17cafeaad2f63b19ddbf840f0066a15b939f`; host uses Vite alias to live plugin source. No cross-repository merge or plugin copy performed. C1 delta verified in plugin tests.

## Database

- Migration `0018_problem_public_metadata`: PASS, applied by `scripts/dev-runtime.ps1 start` against real PostgreSQL.
- Deterministic backfill: existing problems expose `P0001` style IDs; existing evaluations expose `#0` style numbers.
- New-number focused coverage: `tests/public-metadata.test.ts` PASS (6 tests); UUID identity remains internal.

## Runtime

- PostgreSQL, Judge DB, Redis, MinIO: READY/HEALTHY.
- Product API, Judge Service, Host Agent, Web: RUNNING.
- Worker: ONLINE, healthy heartbeat, `REAL_SANDBOXED_EXECUTION`.
- Supervisor: RUNNING via Runtime Manager; port 19092 has no HTTP `/health` route (404 expected for that probe).
- API runtime smoke: PASS, two start/health/ready/404/request-id/graceful-shutdown rounds.
- Supervisor Go qualification: NOT VERIFIED on Windows; Linux-only syscall build errors and pre-existing Linux qualification failures remain. Worker Go tests: PASS (63 tests).

## Focused tests and builds

- Public metadata, JudgeData, Web focused tests: PASS (25 tests in selected run).
- Judge runtime contract tests: PASS (39 tests).
- OnlineCodeEditor C1 tests: PASS (5 tests).
- Web typecheck: PASS.
- API build and Web build: PASS.
- `git diff --check`: PASS.
- One Web test fixture was updated to assert public evaluation number instead of raw UUID.

## Browser smoke

- NOT VERIFIED: Playwright Chromium executable is not installed in environment.
- Direct API smoke confirms public problem payload includes `P0001`, source/creator, and tags field.

## Final fields

- Final main HEAD: `85c993c` (integration commit `chore: integrate batch metadata judge data editor profile`).
- User `Docs/PROJECT_STATUS.md` changes: none dirty at start; existing file content preserved.
- Untracked user artifacts touched: NO.
- Autosave/SSE: not started.
