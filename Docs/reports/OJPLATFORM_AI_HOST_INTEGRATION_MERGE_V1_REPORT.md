# OJPlatform AI Host Integration Merge & Runtime Sync V1 Report

## STATUS

**PASS / MERGED / CANONICAL RUNTIME SYNCHRONIZED**

- `IMPLEMENTED`: qualified AI capability broker feature merged into canonical `main`.
- `TESTED`: OJPlatform baseline, AI Host tests, migrations, architecture/security, and OnlineCodeEditor tests passed as detailed below.
- `RUNTIME VERIFIED`: canonical Runtime Manager start, restart, warm start, and service-level readiness passed from `D:\OJPlatform`.
- `NOT VERIFIED`: full Playwright E2E baseline was not run because an existing test fixture deletes shared `users`, `problems`, and `submissions` tables. No real Relay/provider request was made.
- `BLOCKED`: none of the requested hard exit gates.

## GIT

| Item | Value |
|---|---|
| Main before | `738f061838a06c6ce558c9cbbf3271d22ee788b3` |
| Feature head | `a15923cb4cbd8ea692167fc79c5c9310c135f44d` |
| Merge commit | `a5fe3d7180bed342d7c7287e42aa22f9aee7bfdc` |
| Main validation tip | `c3391b56cab1e5e69cb92ee05259db649d52df13` |
| Main after documentation update | the commit adding this report and status entry |

Feature commits `a0d46b5`, `522667d`, and `a15923c` are ancestors of `main`. The merge was `--no-ff`; no conflicts occurred. Feature branch/worktree remains present and has no tracked or untracked changes; ignored `node_modules` directories remain. `SAFE_TO_REMOVE_WORKTREE = NO` for this run: left intact to preserve its ignored local dependency directories. Feature branch was not deleted.

`origin/main` tracking ref remained at the pre-task `738f061`; local `main` is 5 commits ahead / 0 behind that cached ref after the implementation follow-up. No fetch or push was performed. **Push is required only to publish these local commits to the remote** and was not authorized/performed.

The canonical root’s pre-existing untracked `phase7b-one-command-browser-e2e.png` remains present. No user files were deleted. The tracked source follow-up `c3391b5` applies Prettier formatting and two minimal lint fixes required for `ci:check` (lexical `this` in the broker client closures; explicit removal of an omitted test-fixture field).

## MIGRATIONS

- `0037_ai_capability_usage.sql` and its down file are tracked.
- `0038_ai_capability_usage_prompt_provenance.sql` and its down file are tracked.
- `scripts/migrations/product-manifest.mjs` recognizes both with checksums.
- Before canonical start, the live shared database already had both migrations applied. Feature-manifest status was `UP_TO_DATE`: 41 applied, 0 pending, no checksum mismatch, no adoption required.
- Canonical status after merge/start/restart/warm start: `UP_TO_DATE`, 41 applied, 0 pending, 0 unknown, 0 checksum mismatches. Ledger rows for both IDs and the `provenance` column were directly verified.
- No migration ran during this task. The migration runner performed a no-op on start. **Backup: N/A**, because there was no pending write migration; no ledger edits, rollbacks, resets, reseeds, volume removal, or table drops occurred.

## DATABASE SAFETY

Pre-canonical-start fingerprint (after focused integration tests, before Runtime Manager migration check):

| Fingerprint | Before | After canonical start | After full Vitest qualification |
|---|---:|---:|---:|
| Public tables | 59 | 59 | 59 |
| Users | 155 | 155 | 155 |
| Problems | 135 | 135 | 135 |
| Submissions | 69395 | 69395 | 69395 |
| AI usage requests | 25 | 25 | 30 |
| AI usage attempts | 5 | 5 | 6 |

The final `+5` request / `+1` attempt rows are from the real Postgres usage-ledger integration test executed once by the full Vitest qualification; that test intentionally uses run-unique records and documents that shared development ledger rows accumulate. They are test evidence, not migration side effects. The `0038` provenance column existed before and after canonical startup.

## RUNTIME

Before canonical start, infrastructure probes were READY while product app services were DOWN and the shared registry named another checkout. After `D:\OJPlatform\scripts\dev-runtime.ps1 start`, then `restart`, then a warm `start`, status reported canonical source `D:\OJPlatform` at `c3391b5`, `MIXED SOURCE = False`, and:

- PostgreSQL: READY (`connect + SELECT 1`)
- Redis: READY (`PING -> +PONG`)
- MinIO: READY (`/minio/health/ready` HTTP 200)
- API: RUNNING; `GET /health` = HTTP 200
- Web: RUNNING; `GET /` = HTTP 200
- Judge Service: RUNNING; health endpoint = HTTP 200
- Host Agent, Supervisor, Worker: RUNNING / owned and healthy
- AI diagnostics route unauthenticated response: HTTP 401 as designed
- Warm/idempotent `start`: PASS; migrations remained up to date and services were reused
- Normal `restart`: PASS; infrastructure and database volumes were preserved

## AI HOST / SECURITY

Feature qualification on the clean feature worktree passed **66/66** across 8 suites:

- Capability broker 19/19; manifest dialect and legacy compatibility 11/11.
- AI module 14/14, including optional/no-config boot, kill switch, site caller, plugin caller, fake-provider execution, and invalid/missing Bridge behavior.
- AI routes 5/5; Postgres usage ledger 4/4; Redis governance/idempotency stores 8/8.
- Browser secret scan 1/1 and migration architecture 4/4.

The same tests passed again under the full canonical baseline. Architecture gate passed; it verified expected forbidden-dependency fixtures fail and no static `@aibridge/*` dependency or mutating `/api/ai` execution route exists. Browser scanning covers Web and `plugins/OnlineCodeEditor/src`; no provider key, credential value, Authorization header, or resolved secret was present in browser output. No real credential was read or printed; live Relay smoke was skipped.

## REGRESSION / OTHER REPOSITORIES

- `pnpm ci:check`: PASS — format, lint, typecheck, Vitest baseline, architecture, build.
- Vitest: 1144 collected / 1091 passed / 48 known failures / 5 known pending. Exact comparison against the accepted baseline: missing 0, new failures 0, changed failure signatures 0, new pending 0, resolved 0. No baseline was expanded.
- OnlineCodeEditor pinned head `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`: 56/56 tests and typecheck PASS. OJ manifest-dialect regression verifies the actual V1 manifest shape, defaults, and browser `PluginHost` contribution in `problem.solve.editor`. Build was not rerun in that checkout.
- AIBridge head `3e7dec5ae49badb71278d0ec456c29c70d5c9b6e`: `npm run verify` PASS (509 tests, typecheck, lint, gates, build, offline package portability); no tracked source changes or commits.
- AlgoQuest head `3d6cb946dfc6933b5081074f328021a4f3fdad27`: clean; no commands or changes.
- E2E baseline intentionally NOT RUN: `tests/e2e/phase1c-submission-real-runtime.spec.ts` contains table-wide deletes for `submissions`, `problems`, and `users`, which is unsafe against the shared development database. No E2E fixture was allowed to risk business data.

## PRESERVED WORKSPACE INVENTORY

Pre-existing canonical-root untracked file preserved:

```text
phase7b-one-command-browser-e2e.png
```

Pre-existing ignored canonical-root items were recorded and not cleaned. Package install/build and Runtime Manager updated their own dependency/build/runtime state only; no ignored tree was removed:

```text
.phase1e-api-harness.json  .phase1e-api-harness.log
.phase1er-final-spec-20260829/  .phase2a-lead-spec-read/
.phase2b-bootstrap-spec/  .phase2b-final-spec/
.phase2c3-spec-read/  .phase2c5-spec-read/  .phase2c6-spec-read/
.phase2c7a-spec-read/  .phase2c7b-r1-runtime-bin/
.phase2c7b-r1-runtime/{judge-service-3117.stderr.log,judge-service-3117.stdout.log,supervisor-a.stderr.log,supervisor-a.stdout.log,supervisor-b.stderr.log,supervisor-b.stdout.log,worker-a.log}
.phase2c7b-r1-spec-read-current/  .phase2c7b-r1-spec-read/  .phase2c7b-r1q-spec-read/
.phase2c7b-runtime-bin/  .phase2c7b-runtime/{supervisor-a.log,supervisor-b.log}  .phase2c7b-spec-read/
.phase2c8a-goal-read/  .phase2c8bc-goal-read/  .phase2c8d-goal-read/
.phase2c8d-hostagent-spec-read/  .phase2c8d-pool-read/  .phase3c-goal-read/
.phase3d-goal-read/  .phase3d-runtime-testdata/  .runtime/
.worker-browser-a.log  .worker-browser-b.log
Docs/reports/SUBMISSION_DETAIL_503_FIX_REPORT.md  Goals/
_tmp_2c4_inspect_20260902/  _tmp_3a_inspect_20260902/
_tmp_phase3d1_api.err.log  _tmp_phase3d1_api.log  _tmp_phase3d1_web.err.log  _tmp_phase3d1_web.log
apps/api/node_modules/  apps/judge-host-agent/node_modules/
apps/judge-service/dist/  apps/judge-service/node_modules/
apps/judge-worker/.runtime/  apps/judge-worker/dist/
apps/web/dist/  apps/web/node_modules/  dist/  node_modules/
packages/cache/node_modules/  packages/database/node_modules/
packages/judge-runtime/node_modules/  packages/storage/node_modules/
test-results/  tests/fixtures/phase3c-runtime-batch.zip  tmp/  worker-a.out.log
```

The separate OnlineCodeEditor checkout also retained its pre-existing untracked `nul` and `pnpm-lock.yaml`. The AIBridge verification left its ignored build outputs in place. No source changes were made to OnlineCodeEditor, AIBridge, or AlgoQuest.

## CANONICAL SYNC / NEXT

- Source: SYNCED — `main` contains the qualified integration.
- DB: SYNCED — ledger and source agree through 0038.
- Runtime: READY — canonical source, status probes, restart, and warm start all agree.
- Parallel development may resume after this report. AlgoQuest Stage 7 and AIBridge Stage 7 were not started; this task stops here.
