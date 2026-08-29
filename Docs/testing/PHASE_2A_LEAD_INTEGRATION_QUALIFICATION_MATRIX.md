# PHASE 2A Lead Integration Qualification Matrix

Date: 2026-08-29  
Execution root: `D:\OJPlatform`  
Final decision: **PASS**

All fixture/source inputs in this matrix were inert strings. No submitted source was compiled, interpreted, evaluated, shelled, dynamically imported, or executed.

| ID | OWNER | SETUP | EXPECTED | ACTUAL | EVIDENCE | RESULT |
|---|---|---|---|---|---|---|
| LI01 | Lead | Verify common baseline and branch ancestry | `6cd4b7c` ancestor and ordered merges | Auth, Runtime, Web merged in required order; no conflicts | git graph and merge commits | PASS |
| LI02 | Lead | Auth integration | Worker authorization composed | Authz tests and API owner resolution pass | `tests/worker-authz.test.ts` | PASS |
| LI03 | Lead | Runtime integration | Independent Go Worker remains protocol 2A.1 | Binary builds and real harness runs | Go build/tests; qualification harness | PASS |
| LI04 | Lead | Web integration | Server-backed stage/cancel UX | Web tests and real browser journey pass | Web tests; Playwright x2 | PASS |
| LI05 | Lead | Contract audit | Submission/job/linkage remain separate and immutable | Redis job retains submission/revision/testdata/language linkage | queue repository and harness output | PASS |
| LI06 | Lead | Scope audit | No Phase 2B/Sandbox/source execution | Only safe fixtures are enabled | protocol/capability and source audit | PASS |
| HB-L01..HB-L10 | Lead/Runtime | Two workers, Redis heartbeat keys, stale TTL, restart/shutdown | Safe liveness projection, unique instances, offline/degraded truth, no secrets | Worker A/B instances `84a674f6...`, `d57c3ffa...`; diagnostics projected safe fields; harness shows stale A removal | API diagnostics; worker harness | PASS |
| CAN-L01..CAN-L14 | Auth/Lead/Runtime | Owner, unrelated, terminal, repeated, before-claim, during-fixture and race cases | Authoritative owner/operator checks and one terminal effect | Route tests: 401/403/409 and idempotency; API cancel final `CANCELLED`; direct worker harness during fixture final `CANCELLED` | `tests/worker-control.test.ts`; API cancel harness; real worker harness | PASS |
| JQ09 | Runtime/Lead | Cancelled queued job then start workers | Worker must not execute fixture | Attempt remained 0 and status remained `CANCELLED` | real worker harness | PASS |
| JQ10 | Runtime/Lead | FX-CANCEL lease plus authoritative cancellation signal | Worker observes bounded cancel; no success after cancel | Attempt 1 ended `CANCELLED` | API cancel and worker harness | PASS |
| JQ11 | Runtime/Lead | Cancellation/completion race | Exactly one authoritative resolution | Redis final state single terminal `CANCELLED` or success; no duplicate terminal write | race harness/repository idempotency | PASS |
| JQ01,JQ02,JQ03,JQ04,JQ05,JQ06,JQ07,JQ08,JQ12 | Runtime | Queue unit/Redis and real worker runs | Claim race, bound, success/retry/terminal, stale recovery and shutdown correctness | Passing queue suites and real crash recovery attempt 2 | queue tests; Go harness | PASS |
| AR2A-01..AR2A-07 | Lead | Restart API only while workers/Redis/DB remain up | Jobs, heartbeats and worker identities survive | API PID changed; both worker processes and instance IDs remained unchanged; readiness 200 | lifecycle harness and diagnostics | PASS |
| RR2A-01..RR2A-10 | Runtime/Lead | Restart Redis with worker alive | DEGRADED/NOT READY during loss, bounded reconnect, READY after | Worker `/ready` degraded during restart and returned 200 after reconnect; API recovered | Redis restart injection | PASS |
| WF2A-01..WF2A-10 | Runtime | Kill Worker A process during FX-SLOW lease | Worker B continues, stale lease recovers, old instance cannot overwrite | Worker B completed attempt 2; no duplicate terminal effect | real worker harness | PASS |
| J2A-1 | Web/Lead | Fresh browser identity, API, Redis, Go workers | Login -> problem -> submission -> synthetic completion -> logout | Server-backed synthetic completion and honesty text observed | `phase2a-real-runtime.spec.ts` Run 1/2 | PASS |
| J2A-2 | Web/Lead | Retry fixture and queue attempt | Server owns attempt/requeue | Queue retry and attempt semantics pass; browser covers server-backed status | queue tests and runtime evidence | PASS |
| J2A-3 | Web/Lead | Worker/Redis degradation and recovery | Operational state, never fake verdict | `/ready` degraded then recovered; capability remains safe fixture only | Redis injection and UI tests | PASS |
| J2A-4 | Web/Lead | Active FX-CANCEL and authorized API cancel | Pending -> authoritative cancel -> refresh | API cancel final `CANCELLED`, repeated cancel idempotent | API cancel harness; route tests | PASS |
| J2A-5 | Auth/Lead | Ordinary user diagnostics/capability requests | 403 and no protected data | 403 observed; operator diagnostics returned safe worker list | browser/API requests | PASS |
| NS2A-01..NS2A-15 | Security | Inert markers including `system`, `os.system`, `eval`, shell text and executable paths | No execution, source/log/secret/lease leakage, no DB access | Static protocol/worker audit, safe logs, no source marker in harness output; real mode false | Go protocol/worker tests; harness | PASS |
| Playwright Run 1 | Lead/Web | Fresh identity/data, real API/Redis/Worker | Complete server-backed browser journey | 1 passed | Playwright output | PASS |
| Playwright Run 2 | Lead/Web | Independent fresh identity/data | Independent repeat | 2 passed with `--repeat-each=2` | Playwright output | PASS |
| Responsive | Web | 390px and desktop layouts | No overlap/regression | Existing responsive tests pass; browser build succeeds | Web/E2E suites | PASS |
| Accessibility | Web | Keyboard/focus and semantic controls | Accessible interaction | Existing accessibility assertions pass | Web tests/E2E | PASS |
| Browser console | Web | Real browser runs | No unexpected console/page errors | No unexpected errors in real journey | Playwright output | PASS |
| Product regression | Lead/Web | Auth, Home, Problemset, Detail, Profile, Authoring, submissions | Existing workflows remain intact | 197 tests and integration pass | `pnpm test`, integration | PASS |
| Full regression | Lead | All required static/build/runtime checks | Green | format, lint, typecheck, test, architecture, build, Go fmt/test/vet, integration, diff check pass | command record | PASS |
