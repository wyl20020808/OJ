# PHASE 1E-R Lead Runtime Recovery Bridge

## Executive Status

PHASE 1E-R RUNTIME RECOVERY BRIDGE = PASS

This is a qualification-only recovery bridge. It does not qualify a real Judge, Sandbox, source execution, Contest, deployment, or PHASE 2. Submitted source remained inert stored text throughout every runtime check.

## Starting State and Provenance

STARTING LEAD HEAD = `5e3e5c9` (current recovery bootstrap lineage; integration began from the approved `38fdbc4` common recovery baseline).

| Workstream | Baseline | Actual tip | Ancestry | Ownership | Integration |
|---|---|---|---|---|---|
| Authz | `38fdbc4` | `f6758fb3ceb247d5c4f8534551d4e286b96b8a` | ancestor PASS | Authz module, test, report | normal merge `4e37e42` |
| Queue | `38fdbc4` | `b745f7afc53e890d9f67d279c112cc707a0803ec` | ancestor PASS | Judge queue module, tests, report | normal merge `0dd69ac` |
| Web | `38fdbc4` | `f09bf4d86992f33cb8a24835023380d271731f7c` | ancestor PASS | Web app, API client, Web tests/report | normal merge `3b400af` |

Queue provenance was audited as `38fdbc4 -> 88a32cc -> 08793f0 -> b745f7a`; all intermediate files are Queue-owned. Merge conflicts = none. Ownership violations = none.

## Lead Integration

Changed Lead-owned files compose an authoritative `Judge Job -> Submission -> owner` resolver, a public Job projection, qualification-only controls, a scoped API lifecycle harness, real-runtime R05/R06 probe, and a dedicated real browser suite. The public projection omits owner identity, raw lease token/owner/expiry, Redis key/credential/payload, source, and fixture internals. Unknown state is denied by the public authorization policy rather than mapped to success.

Qualification controls exist only when both `OJPLATFORM_PHASE1E_QUALIFICATION=true` and a runtime-only control key are set. Each control verifies the authenticated owner through the public Authz policy before operating the target Job. It accepts no shell command, arbitrary Redis command, source, or verdict input.

Qualification jobs use the isolated `oj:judge:qualification` Redis prefix. This prevents a malformed historical entry in the normal shared namespace from being mutated or blocking recovery qualification. The probe clears only this test-owned namespace before a run.

## Runtime Lifecycle and WSL

Lead lifecycle order was: keep WSL forwarding alive with `wsl.exe -d Ubuntu-24.04 -- sleep infinity`; start/verify PostgreSQL, Redis, and MinIO; start the API via the scoped harness; poll `/health` and `/ready`; let Playwright start only the Web preview; run evidence; then perform final teardown after evidence collection.

The prior browser disruption was not caused by a Worker teardown. The concrete Lead defect was lifecycle ownership: the first harness retained child stdio pipes and later caused the API process to be tied to its control command. The harness now launches a detached, PID-recorded API process with file-backed log capture. It stops only the recorded API PID using `taskkill /PID <pid> /T /F`, never broad `node.exe`, WSL, PostgreSQL, Redis, or MinIO.

## API Restart Qualification

R05 = PASS. A real user created a published Problem and Submission; the real API enqueued exactly one Redis Job. After an API-only restart, the same public Job ID and attempt remained observable. A repeat direct idempotent enqueue returned `created=false` and the same Job ID, then the qualification fixture completed it synthetically.

R06 = PASS. In the valid-lease case, a real leased Job completed through the qualification control after API restart. In the expiry case, an intentionally short lease expired, stale recovery produced a new attempt, the old raw token was rejected, and only the new lease completed. PostgreSQL, Redis, and API readiness were true before and after the R05 restart.

## Real Browser Qualification

J1 = PASS. Two browser runs used UI registration/login, a real published Problem API seed, UI submission of inert text, queued -> leased -> synthetic completion controls, refresh consistency, explicit `SYNTHETIC · QUALIFICATION ONLY · NOT A REAL EXECUTION VERDICT` wording, unrelated-user denial, and logout cache safety.

J2 = PASS. The browser drove a second real Submission through claimed attempt 1, retryable protocol failure, requeue, leased attempt 2, and synthetic completion. Attempt metadata was projected by the API; the client never incremented it.

J4 = PASS. API-only outage produced a retryable service surface rather than a terminal Judge result; restarting the API restored the same server-backed detail. A controlled Redis stop produced the same safe service behavior; Redis restart and `/ready` restored the detail. No source execution occurred.

W11 = PASS. Playwright Run 1 passed.

W12 = PASS. Playwright Run 2 passed independently after verifying API `ok` and PostgreSQL, Redis, and MinIO `healthy` after Run 1. Those services remained healthy after Run 2 as well.

## Security and Logging

The harness log scan found no inert source marker, password/control marker, raw lease-token literal, Redis credential, or PostgreSQL credential. Browser assertions accepted only expected resource errors from intentional 401/404 and controlled 500/502/503 outage paths; no unexpected console error or page error was accepted. Queue safety tests and static scans found no submitted-source execution primitive. Synthetic state remains visibly non-verdict end-to-end.

## Regression

PASS: `pnpm format:check`; `pnpm lint`; `pnpm typecheck`; `pnpm test` (114 passed, 3 opt-in Redis tests skipped); `pnpm integration` (4 passed); `pnpm test:architecture`; `pnpm build`; `pnpm runtime:smoke` (two rounds); real R05/R06 probe; Playwright Run 1; Playwright Run 2; `git diff --check`.

## Known Limitations and Deferred Work

- This bridge is not final PHASE 1E requalification and does not mark PHASE 1E PASS.
- Redis persistence remains a local qualification foundation, not an HA or production durability claim.
- No real Judge, Sandbox, compiler/interpreter, submission execution, Contest, or production deployment was implemented.
- The qualification control plane is disabled outside explicit qualification mode and is not a production worker interface.

## Final Readiness

BRIDGE MATRIX = `Docs/testing/PHASE_1E_R_LEAD_RUNTIME_BRIDGE_MATRIX.md`

PROJECT STATUS = `PHASE 1E PARTIAL / RUNTIME RECOVERY BRIDGE PASS / READY FOR FINAL REQUALIFICATION`

READY FOR FINAL PHASE 1E REQUALIFICATION = YES

INTEGRATION COMMIT = `71cb46c`

CLOSURE COMMIT = this documentation closure commit

FINAL HEAD = recorded by the final Git commit for this Goal

GIT STATUS = to be recorded after runtime cleanup and commits; protected `Goals/` remains untracked and unmodified.
