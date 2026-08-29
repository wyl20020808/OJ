# PHASE 1E-R Final Requalification Matrix

Date: 2026-08-29. Execution root: `D:\OJPlatform`. Decision: **PARTIAL**.

| ID | Setup | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|
| A-FINAL-01..16 | API auth/composition coverage | Actor and operation authorization fails closed | Existing focused authorization tests pass; complete fresh actor matrix not rerun | `pnpm test` | NOT VERIFIED |
| Q01..Q30 | Queue unit/Redis suites | Enqueue, concurrency, leases, retries, tokens, terminal/linkage/isolation | Full queue coverage passes; bridge confirms duplicate enqueue, recovery and old-token rejection | queue tests; bridge probe | PARTIAL |
| R01..R04 | Redis/integration recovery | Unavailable/disconnect/reconnect/restart recover | Integration and Redis suites pass | `pnpm integration` | PASS |
| R05 | API restart after enqueue | Same job and idempotent enqueue survive | Same ID, duplicate=false, attempt stable; services ready before/after | `phase1er-bridge-probe.mjs` | PASS |
| R06 | API restart during lease/expiry | Valid lease survives; stale lease recovers; old token rejected | Valid completion survived; attempt 2 recovery and rejection observed | `phase1er-bridge-probe.mjs` | PASS |
| R07..R10 | Worker crash, malformed payload, runtime paths | Safe recovery and transport errors | Go normal tests pass; real process stop fails on Windows; browser path failed before outages | Go/Playwright output | PARTIAL |
| S01..S10 | Static/runtime source audit | No source execution, shell, network, leakage or fake verdict | Inert markers used; complete fresh security rerun not done | existing audit/report | NOT VERIFIED |
| W01..W30 | Web unit/E2E/product regression | Status, auth, refresh, errors, responsive, console and product journeys | 194 unit tests pass; browser failed at `Leased` assertion | `pnpm test`; Playwright | PARTIAL |
| J1..J4 | Real API/Web journeys | Synthetic success, retry, forbidden, recovery | Bridge controls pass; browser rerun blocked by status mismatch | bridge/Playwright | PARTIAL |
| PLAYWRIGHT-1 | Real runtime, fresh identity/data | Complete run and healthy services | Failed: `Leased` not visible after fixture claim | E2E output | FAIL |
| PLAYWRIGHT-2 | Independent fresh identity/data | Independent complete run | Blocked by Run 1 mandatory failure | E2E invocation | BLOCKED |
| REGRESSION | Format, lint, typecheck, tests, integration, architecture, build, smoke, diff | All mandatory gates pass | Most pass; format flags `worker-control.ts`; Go graceful-stop fails | command outputs | PARTIAL |

## Blockers

1. `pnpm format:check` flags `apps/api/src/modules/judge/worker-control.ts`.
2. The Go process test completes the job but Windows `SIGTERM` exits status 1, so graceful stop is unqualified.
3. Playwright Run 1 cannot observe `Leased` after fixture claim; Run 2 is blocked.
4. The checkout contains Phase 2A worker commits and uncommitted worker-control changes, so frozen “Phase 2 not started” is not met.
