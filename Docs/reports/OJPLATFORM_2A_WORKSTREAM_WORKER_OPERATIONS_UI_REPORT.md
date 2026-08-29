# OJPlatform Phase 2A Worker Operations UI Report

## 1. Status

`PARTIAL / READY FOR LEAD INTEGRATION`. The Web-owned execution-stage UX is implemented and component-tested against the frozen safe projection. The common baseline has no composed Phase 2A public Worker stage, capability, diagnostics, or cancellation endpoints, so real Worker/API browser journeys cannot truthfully pass yet.

## 2. Worktree / branch

Worktree: `D:\OJPlatform-worktrees\phase1b-web-authoring`  
Branch: `codex/phase2a-worker-ops-ui`

## 3. Baseline / provenance

Verified before changes: current worktree path and branch matched the Goal, `HEAD` was `6cd4b7c`, `6cd4b7c` is an ancestor of `HEAD`, and the tracked worktree was clean.

## 4. Starting / final HEAD

Starting HEAD: `6cd4b7c` (`docs: bootstrap phase 2A judge worker foundation`).  
Final HEAD: recorded after the scoped commit.

## 5. Commits

One scoped Web Worker Operations UX commit, including implementation, tests, browser specifications, and this report.

## 6. Files changed

- `apps/web/src/services/api.ts`: additive Web-only public projection types for known Phase 2A execution stages.
- `apps/web/src/app/App.tsx`: execution-stage mapping, manual server refresh, request sequencing/unmount cleanup, and specific 401/403/404/409/5xx/network UI semantics.
- `apps/web/src/app/app.css`: refresh-control spacing using existing visual vocabulary.
- `tests/phase2a-worker-ops-ui.test.tsx`: forty independent W2A component/security tests.
- `tests/e2e/phase2a-worker-ops-ui.spec.ts`: five Lead-runtime browser journey specifications.
- This report.

No Go Worker, API route composition, Redis, Auth internals, shared contract, migration, root manifest, lockfile, Sandbox, or `Docs/PROJECT_STATUS.md` file was changed.

## 7. Existing UI audit

The existing React product shell already used a typed API client, memory-only component state, a shared `JudgeStatus` component for submission history/detail, request-version guards, explicit error states, and visible focus styles. It had no Worker diagnostics view, cancellation call, capability call, polling, or persistent Web cache. The Phase 2A work extends that existing status component and detail page instead of creating a parallel UI system.

## 8. Execution-stage mapping table

| API state or public `executionStage` | UI label | Operator detail | Synthetic warning | Terminal |
|---|---|---|---|---|
| `QUEUED` | Queued | None | Waiting for Judge Protocol worker | No |
| `LEASED` | Leased | None | Synthetic protocol qualification; source not executed | No |
| `CLAIMED` | Worker lease claimed | None | Synthetic protocol qualification; source not executed | No |
| `WORKER_ACCEPTED` | Worker accepted the job | None | Qualification protocol only; source not executed | No |
| `SAFE_FIXTURE_RUNNING` / legacy `RUNNING` | Qualification fixture running | None | Synthetic safe fixture; source not executed | No |
| `FAILED_RETRYABLE` / legacy `RETRYABLE_FAILURE` | Retryable protocol failure | None | Infrastructure/protocol, not source verdict | No |
| `REQUEUED` | Retrying infrastructure step | None | Requeued, not source verdict | No |
| `FAILED_TERMINAL` / legacy `PROTOCOL_FAILURE` | Terminal protocol failure | None | No execution result | Yes |
| `CANCELLED` | Qualification job cancelled | None | No source execution | Yes |
| `SAFE_FIXTURE_SUCCEEDED` / legacy `SYNTHETIC_COMPLETED` | Synthetic completion | None | `SYNTHETIC · QUALIFICATION ONLY · NOT A REAL EXECUTION VERDICT` | Yes |
| `WORKER_DEGRADED` | Judge worker degraded | None | Operational state, not result/verdict | No |
| `WORKER_OFFLINE` | Judge worker unavailable | None | Operational state, not result/verdict | No |
| Unknown | Unknown protocol state | None | Unsupported state; refresh safely | Unknown |

The mapping consumes `submission.executionStage` when a future public projection supplies it, otherwise it preserves the current `submission.status` behavior. The browser never advances any status itself.

## 9. Worker status / diagnostic model

No global worker fleet panel was added because the frozen baseline has no public/Authz-composed diagnostics endpoint. The Web does not expose worker id, instance id, heartbeat, raw lease token, Redis keys, credentials, command lines, source, or stack traces. W2A-33/W2A-34 prove absence of invented diagnostics; an operator-only safe diagnostics projection is requested below.

## 10. Capability honesty

No capability manifest is rendered until it is server-backed. The Web does not infer C++/Python/Java execution support from the language selector. The only successful terminal language is visibly `SYNTHETIC · QUALIFICATION ONLY · NOT A REAL EXECUTION VERDICT`; the UI does not claim real sandbox execution.

## 11. Server-backed refresh / polling

Detail initial load and `Refresh qualification status` call the existing public submission endpoint. Refresh preserves the last server response while loading and a monotonically increasing request version rejects late older responses. Cleanup increments the version on unmount/route change. No polling exists in the current product, so no interval is introduced, no terminal polling runs, and logout/unmount has no timer to leak.

## 12. Cancellation UX

`NOT IMPLEMENTED / BLOCKED BY PUBLIC API`. The frozen baseline provides no composed public cancellation endpoint, authorization projection, or state capability. The Web deliberately has no cancellation button, pending UI, or optimistic terminal transition. It will not say “kill running code.” IR-2A-WEB-003 defines the required contract.

## 13. Error / recovery semantics

401: `Sign in required` and no protected content.  
403: `Submission forbidden` and no source/diagnostics.  
404: `Submission not found`.  
409: `Submission state changed` with server refresh.  
5xx: `Submission unavailable` with retry.  
Network: `The service could not be reached.` with retry.  
Worker degraded/offline: operational statuses, never a real verdict.  
Retryable and terminal failures remain protocol/infrastructure states. Unknown state remains neutral.

## 14. Source / security review

Authorized source remains a React text child in `pre.source`; source marker `<script>`, `eval`, `system`, and shell-looking text remain inert. There is no `dangerouslySetInnerHTML`, eval, dynamic source import, direct Redis/Worker connection, localStorage/sessionStorage cache, URL secret transfer, or console logging of source. `JudgeStatus` ignores untrusted lease-token/session-secret-shaped extra fields, preventing their DOM exposure.

## 15. W2A-01..W2A-40

All forty individual Web/component tests executed and passed in `tests/phase2a-worker-ops-ui.test.tsx`.

| Rows | Result | Evidence |
|---|---|---|
| W2A-01..10 | PASS | frozen stage mapping and no-verdict test cases |
| W2A-11..16 | PASS | manual refresh, history/detail mapping, late-response race, no polling, unmount, logout tests |
| W2A-17..23 | PASS | 401/403/404/409/5xx/network/degraded-specific tests |
| W2A-24..25 | PASS (safe absence) | no capability inferred or real execution claimed without server projection |
| W2A-26..28 | PASS | source inert and lease/secret marker exclusion tests |
| W2A-29..32 | PASS (safe absence) | cancellation controls absent pending a frozen public contract; no optimistic fake resolution |
| W2A-33..34 | PASS (safe absence) | no invented diagnostics and no ordinary-user fleet data |
| W2A-35..40 | PASS | wrapping structure, browser viewport, keyboard/focus, semantic status, console tests |

The rows that require a real composed Worker endpoint are component-prepared, but their end-to-end runtime qualification remains blocked by the Integration Requests below.

## 16. J2A-1..J2A-5 readiness / results

| Journey | Result | Reason |
|---|---|---|
| J2A-1 normal safe-fixture | READY FOR LEAD | requires server-driven `QUEUED -> WORKER_ACCEPTED -> SAFE_FIXTURE_RUNNING -> SAFE_FIXTURE_SUCCEEDED` projection |
| J2A-2 retry | READY FOR LEAD | requires server-driven retry/requeue/attempt projection |
| J2A-3 degraded/recovery | READY FOR LEAD | requires Lead runtime failure injection and recovery |
| J2A-4 cancellation | BLOCKED | public cancel endpoint/Authz projection absent |
| J2A-5 forbidden diagnostics | BLOCKED | operator-only diagnostics endpoint/Authz projection absent |

`pnpm exec playwright test tests/e2e/phase2a-worker-ops-ui.spec.ts --workers=1` executed five intentional skips with the documented missing Lead runtime condition. No frontend fake server state was used.

## 17. Responsive evidence

Local browser inspection with the in-memory API: 1440x900 reported `scrollWidth: 1440`; 390x844 reported `scrollWidth: 375`. There was no horizontal overflow. Existing flex-wrap status cards and responsive shell retain long-status handling. This is Web UI evidence, not Worker runtime qualification.

## 18. Accessibility evidence

Status cards use `role="status"` with meaningful accessible labels. Loading/error states retain `role="status"`/`role="alert"`. The named refresh control is keyboard-focusable; existing `:focus-visible` styling remains. Status wording carries meaning independent of color. No polling announces repeated status updates because no polling was added.

## 19. Browser console

The local in-app browser recorded no console `error` entries on the representative local page. Playwright startup emitted only `NO_COLOR` environment warnings.

## 20. Product regression

`pnpm test` passed 154 tests in 14 files, with 3 existing skips. Existing Home, Login/Register, Problemset, Problem Detail, Profile/Account, Authoring, Submission creation, history, and detail coverage remains green.

## 21. Integration Requests

### IR-2A-WEB-001 — server-backed Phase 2A submission execution stage

**Blocked UI behavior:** real J2A-1/J2A-2/J2A-3 state transitions and runtime W2A qualification.  
**Required endpoint/projection:** existing owner-authorized `GET /api/submissions/:id` and list projection must add safe `executionStage` enum (`QUEUED`, `LEASED|CLAIMED`, `WORKER_ACCEPTED`, `SAFE_FIXTURE_RUNNING`, `FAILED_RETRYABLE`, `REQUEUED`, `FAILED_TERMINAL`, `CANCELLED`, `SAFE_FIXTURE_SUCCEEDED`, `WORKER_DEGRADED`, `WORKER_OFFLINE`) and the existing public attempt metadata.  
**Safe fields:** enum, attempt/max attempts, synthetic flag, safe failure code, timestamps only. No source addition, lease token, worker identity, Redis, credentials, command, or trace.  
**Auth requirement:** owner may see own projection; unrelated users remain denied/anti-enumerated.  
**Tests blocked:** J2A-1/J2A-2/J2A-3, real runtime portions of W2A-01..23.

### IR-2A-WEB-002 — server-backed capability projection

**Blocked UI behavior:** truthful display of capability manifest (W2A-24/W2A-25 real API qualification).  
**Required endpoint/projection:** `GET /api/judge/capabilities` returning only `protocolVersion`, `safeFixtureQualification`, `realSandboxedExecution`, `sandboxCapability`, `languageCapabilities`, and safe build/capability version when authorized.  
**Safe fields:** exactly frozen capability fields; no worker instance id, endpoint, Redis, DB, command, source, credential, or lease token.  
**Auth requirement:** public vs operator scope must be decided by Authz; server must default deny privileged fields.  
**Tests blocked:** real runtime portions of W2A-24/W2A-25 and J2A-1.

### IR-2A-WEB-003 — cancellation public API and authorized action projection

**Blocked UI behavior:** W2A-29..32 and J2A-4.  
**Required endpoint/projection:** owner/operator-authorized `POST /api/submissions/:id/judge/cancel` returning the refreshed safe submission execution projection; `GET /api/submissions/:id` must expose an explicit `canRequestCancellation` boolean only when authorized and state-eligible.  
**Safe fields:** boolean/action result, status/stage, attempt, safe diagnostic code. No lease token, source, worker command, credential, or queue details.  
**Auth requirement:** server-side default deny; distinguish 403, 404, 409 already terminal/race, and idempotent cancelled result.  
**Tests blocked:** W2A-29..32 and J2A-4.

### IR-2A-WEB-004 — operator-only Worker diagnostics

**Blocked UI behavior:** authorized W2A-33/J2A-5 diagnostic journey.  
**Required endpoint/projection:** Authz-protected `GET /api/operations/judge-workers`, returning only safe operator diagnostics: worker id, instance id, lifecycle, heartbeat age, protocol/build version, max concurrency, active jobs count, safe capability summary, and safe degraded reason code.  
**Safe fields:** listed fields only; explicitly omit lease tokens, Redis/DB/session credentials, source, arbitrary command, process line, and stack trace.  
**Auth requirement:** ordinary user must receive 403/anti-enumerated response and no stale diagnostics.  
**Tests blocked:** real runtime W2A-33/W2A-34 and J2A-5.

## 22. Dependency Requests

None. No dependencies, root manifest, or lockfile changes were required.

## 23. Limitations

The baseline cannot demonstrate independently running Go Worker behavior, API composition, Redis heartbeat/offline transitions, capability visibility policy, cancellation authorization, or operator diagnostics. This work does not claim real user-source execution, compiler/interpreter support, Sandbox isolation, or real verdicts.

## 24. Git status

Must be clean after the scoped commit.

## 25. READY FOR LEAD INTEGRATION

`YES` for the Web implementation and its precise integration handoff. Phase 2A runtime qualification remains pending IR-2A-WEB-001 through IR-2A-WEB-004.
