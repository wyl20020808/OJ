# OJPlatform Phase 2B Sandbox Operations UI Report

## 1. Status

`PARTIAL / READY FOR LEAD INTEGRATION`. The Web-owned safe qualification presentation and its focused matrix are implemented. Real Sandbox qualification journeys remain unavailable because the frozen Phase 2B API/Authz/Runtime composition is not present in this worktree.

## 2. Worktree / Branch

| Item | Value |
| --- | --- |
| Worktree | `D:\OJPlatform-worktrees\phase1b-web-authoring` |
| Branch | `codex/phase2b-sandbox-ops-ui` |
| Starting status | Clean, after provenance gate |
| Final status | Clean after commit (verified below) |

## 3. Baseline / Provenance

The required baseline is `ebf2e06`; the starting HEAD was `ebf2e06`, on the required branch, and was a legal descendant of the baseline. All 19 Goal documents in `OJPLATFORM_PHASE_2B_SANDBOX_OPS_UI_DETAILED_V1.zip` and the frozen Phase 2B contract/context/policy documents were read before implementation.

## 4. Starting / Final HEAD

Starting HEAD: `ebf2e063054085918db089a879e53775d9caefcd`.

Final HEAD: the commit containing this report (`feat: add sandbox qualification operations UI`), resolved by `git rev-parse HEAD` during post-commit verification and reported in the final handoff.

## 5. Commits / Files

The scoped commit contains:

- `apps/web/src/components/SandboxQualification.tsx`
- `apps/web/src/app/app.css`
- `tests/phase2b-sandbox-ops-ui.test.tsx`
- `tests/e2e/phase2b-sandbox-ops-ui.spec.ts`
- this report

No API, Authz internals, Sandbox runtime, migration, `PROJECT_STATUS`, shared contract, or Phase 2C file was modified.

## 6. Existing Web Reuse

| Concern | Existing reuse | Change | Ownership |
| --- | --- | --- | --- |
| Shell/navigation | Existing `App.tsx`, `Link`, `State` | None | Web |
| status semantics | Existing Phase 2A status tone/accessibility conventions | Added Sandbox-specific mapper/component | Web |
| API client | Existing `createApiClient` and credentials/error conventions | No invented Sandbox route; loader is injected | Web |
| refresh/race | Existing manual-refresh pattern | Added generic sequence-safe `useSandboxQualification` | Web |
| responsive/a11y | Existing CSS variables, focus styles, media queries | Added compact overview styles | Web |

## 7. Sandbox Status Mapping

`presentSandboxStatus` maps all frozen states: `NOT_CONFIGURED`, `CONFIGURED`, `IMPLEMENTATION_IN_PROGRESS`, `QUALIFICATION_PENDING`, `QUALIFYING`, `QUALIFIED`, `DEGRADED`, `UNAVAILABLE`, `QUALIFICATION_FAILED`, `CLEANUP_FAILED`, and unknown values. Only the server-provided `QUALIFIED` state is marked qualified. Unknown and failure states fail closed.

## 8. Capability Honesty

Capabilities render only from the supplied safe projection. `unsupported`, `configured`, `implementation_pending`, `qualification_pending`, `qualified`, `degraded`, and `failed` remain distinct. The client does not infer capability from runtime installation, page load, branch, or frontend constants.

## 9. Operator Overview

`SandboxQualificationOverview` is an operator-safe reusable view, but it is not mounted into navigation because no frozen public overview/Authz endpoint exists. When mounted by a future server-backed composition it shows only backend type, policy/probe versions, last qualification timestamp, safe capability summary, safe failure category, and `Disabled / unqualified` real-submission status. Ordinary or unauthorized viewers receive the same non-enumerating message.

## 10. Trusted Probe UX

No probe list/start/result controls were invented. The current frozen contract has no public approved-probe transport. Six browser specs are present as `READY_FOR_LEAD` and skip unless the real integrated runtime flag is enabled.

## 11. Cancel / Control UX

No cancel, PID kill, container kill, Supervisor command, or arbitrary control is exposed. Cancellation remains an Integration Request until a frozen operator/Authz/API contract exists.

## 12. Degraded / Failure / Cleanup-Failure UX

Degraded, unavailable, qualification failed, unknown, policy rejection, transport failure, and cleanup failure each have distinct safe language. `CLEANUP_FAILED` is danger-toned, security-significant, and never qualified. Raw backend exceptions are not rendered.

## 13. Server-Backed Refresh / Race Safety

`useSandboxQualification` accepts only a caller-supplied API/Authz loader, tracks a monotonically increasing request sequence, ignores late responses, clears protected state on authorization loss, and invalidates in-flight work on unmount. It performs no polling and does not invent state transitions.

## 14. Safe Errors / Anti-Enumeration

401/403/404 use the same non-enumerating message. 409 requests an authoritative refresh, 422 reports policy rejection, 5xx reports temporary service unavailability, and transport failures report reachability only. No raw status details, stack, path, or resource existence are exposed.

## 15. Data Leakage Tests

Synthetic `HOST_PATH_MARKER_PHASE2B`, `SOURCE_MARKER_PHASE2B`, `SESSION_SECRET_MARKER_PHASE2B`, and `LEASE_TOKEN_MARKER_PHASE2B` values were supplied through untrusted safe fields; they were absent from rendered DOM. The component also rejects path/source/secret/token/runtime-internal shaped values in safe text fields. No storage, URL, console, or accessible-label writes are performed.

## 16. No Real Execution / No Verdict Deception

The UI states `Disabled / unqualified` for real submission execution and explicitly says qualification probes are security checks, not user-code execution and not OJ verdicts. No `AC`, `WA`, `TLE`, `MLE`, `RE`, or `CE` language is generated.

## 17. W2B-01..W2B-50

Evidence: `tests/phase2b-sandbox-ops-ui.test.tsx`; all 50 independent tests passed in the focused run.

| ID | Setup | Expected | Actual | Evidence | Result |
| --- | --- | --- | --- | --- | --- |
| W2B-01 | CONFIGURED/QUALIFIED mapper | Distinct | Distinct | focused test | PASS |
| W2B-02 | QUALIFICATION_PENDING | Pending label | Pending label | focused test | PASS |
| W2B-03 | QUALIFYING | Running label | Running label | focused test | PASS |
| W2B-04 | QUALIFIED projection | Qualified view | Qualified view | focused test | PASS |
| W2B-05 | DEGRADED | Significant degradation | Correct | focused test | PASS |
| W2B-06 | UNAVAILABLE | Not qualified | Correct | focused test | PASS |
| W2B-07 | QUALIFICATION_FAILED | Failure label | Correct | focused test | PASS |
| W2B-08 | CLEANUP_FAILED | Visible security failure | Correct | focused test | PASS |
| W2B-09 | Unknown enum | Neutral fail-closed | Correct | focused test | PASS |
| W2B-10 | Qualified projection | Real execution disabled | Correct | focused test | PASS |
| W2B-11 | All status text | No verdict terms | None | focused test | PASS |
| W2B-12 | Capability projection | Server values only | Correct | focused test | PASS |
| W2B-13 | unsupported capability | Neutral | Correct | focused test | PASS |
| W2B-14 | failed capability | Failed | Correct | focused test | PASS |
| W2B-15 | No operator authorization | Overview protected | Correct | focused test | PASS |
| W2B-16 | Ordinary user | Diagnostics absent | Correct | focused test | PASS |
| W2B-17 | Stale/missing session | Protected view | Correct | focused test | PASS |
| W2B-18 | No frozen probe API | No probe list | Correct | focused test | PASS |
| W2B-19 | UI inspection | No executable field | Correct | focused test | PASS |
| W2B-20 | UI inspection | No shell field | Correct | focused test | PASS |
| W2B-21 | UI inspection | No mount field | Correct | focused test | PASS |
| W2B-22 | UI inspection | No network target | Correct | focused test | PASS |
| W2B-23 | UI inspection | No env override | Correct | focused test | PASS |
| W2B-24 | UI inspection | No seccomp override | Correct | focused test | PASS |
| W2B-25 | UI inspection | No root/privileged toggle | Correct | focused test | PASS |
| W2B-26 | QUALIFYING projection | Running state | Correct | focused test | PASS |
| W2B-27 | Refresh callback | Caller refresh only | Correct | focused test | PASS |
| W2B-28 | No cancel contract | No cancel control | Correct | focused test | PASS |
| W2B-29 | Repeated cancel | No client trigger | Correct | focused test | PASS |
| W2B-30 | Cancel/completion states | No fabricated resolution | Correct | focused test | PASS |
| W2B-31 | 401 | Safe message | Correct | focused test | PASS |
| W2B-32 | 403 | Same safe message | Correct | focused test | PASS |
| W2B-33 | 404 | Same safe message | Correct | focused test | PASS |
| W2B-34 | 409 | Refresh prompt | Correct | focused test | PASS |
| W2B-35 | 5xx | Service failure | Correct | focused test | PASS |
| W2B-36 | Network failure | Transport message | Correct | focused test | PASS |
| W2B-37 | Out-of-order promises | Older response ignored | Correct | focused test | PASS |
| W2B-38 | Authorization removed | Protected facts cleared | Correct | focused test | PASS |
| W2B-39 | Host marker | Absent from DOM | Correct | focused test | PASS |
| W2B-40 | Secret/source markers | Absent from DOM | Correct | focused test | PASS |
| W2B-41 | Normal render | No console error | Correct | focused test | PASS |
| W2B-42 | Long policy ID | Wraps safely | Correct | focused test | PASS |
| W2B-43 | Desktop view | Stable structure | Correct | focused test | PASS |
| W2B-44 | Keyboard | Refresh focusable | Correct | focused test | PASS |
| W2B-45 | Refreshing | Disabled named control | Correct | focused test | PASS |
| W2B-46 | Status/error | Accessible roles/names | Correct | focused test | PASS |
| W2B-47 | Cleanup failure | No qualified badge | Correct | focused test | PASS |
| W2B-48 | Policy mismatch | Safe rejection | Correct | focused test | PASS |
| W2B-49 | Probe failure | Not whole-Sandbox qualified | Correct | focused test | PASS |
| W2B-50 | Existing product | Isolated reusable view | Correct | focused test | PASS |

## 18. J2B-1..J2B-6 Readiness / Results

All six browser journeys are `READY_FOR_LEAD`, not final runtime PASS. The specs skip unless `OJPLATFORM_PHASE2B_REAL_RUNTIME=true`, because the current branch has no integrated Sandbox overview/probe/cancel API/Authz/runtime fixture. No fake state transition was used.

| Journey | Status | Blocker |
| --- | --- | --- |
| J2B-1 Operator qualification overview | READY_FOR_LEAD | Missing operator-safe overview endpoint and Authz projection |
| J2B-2 Trusted probe journey | READY_FOR_LEAD | Missing approved probe list/start/result API |
| J2B-3 Failure/degraded journey | READY_FOR_LEAD | Missing integrated Sandbox failure fixture |
| J2B-4 Cleanup failure journey | READY_FOR_LEAD | Missing controlled cleanup-failure runtime fixture |
| J2B-5 Authorization boundary | READY_FOR_LEAD | Missing Sandbox diagnostics Authz/API composition |
| J2B-6 Cancellation journey | READY_FOR_LEAD | Missing frozen cancel API/Authz and runtime state |

## 19. Responsive

CSS provides wrapping safe fields, a one-column 390px fact layout, stacked refresh control, and stacked capability rows. Focused tests cover narrow-content wrapping; full 1440/390 browser qualification is pending the real overview route.

## 20. Accessibility

Status uses `role="status"` and an accessible name containing state and note. Errors use `role="alert"`; refresh has an explicit name and disabled busy state; existing global visible focus styles are reused. No color-only status meaning is required.

## 21. Browser Console

Normal local Web journey at `http://127.0.0.1:5175/` was runtime inspected with no warning/error console entries. The Phase 2B browser specs are skipped pending Lead composition.

## 22. Product Regression

`pnpm test` passed: 17 files, 247 tests passed, 3 skipped. Full Playwright run: 4 passed, 13 skipped, 1 existing Phase 1C real-runtime journey failed waiting for `Status PENDING`; this is recorded as a regression/environment blocker and is not attributed to the isolated Phase 2B component.

## 23. Integration Requests

Lead must provide and freeze an operator-authorized safe projection, for example `GET /api/operations/sandbox`, containing only backend type, lifecycle state, policy/probe versions, timestamp, capability states, safe failure category, and real-execution-disabled status. Security/Authz must define anti-enumeration behavior and audit-safe operator visibility.

Runtime/Security must provide an approved probe registry and exact public transport for list, start, result, cleanup verification, and cancellation, including idempotency, 409 conflict semantics, and sanitized error categories. No Web implementation should invent these routes or accept arbitrary probe/config inputs.

Lead must run J2B-1..J2B-6 with the real Supervisor, Authz, API composition and controlled cleanup-failure fixture, then rerun 1440/390, browser console, and product regression gates.

## 24. Limitations

This worker cannot claim real Sandbox qualification, real submission execution, probe execution, cancellation, or production readiness. The API direct-origin CORS configuration also remains outside this Web-owned Goal; local Web verification uses the configured Vite same-origin proxy.

## 25. Git Status

Before commit: only the five scoped files listed above were changed. After commit, `git status --short --branch` was clean on `codex/phase2b-sandbox-ops-ui`.

## 26. READY FOR LEAD INTEGRATION

`YES`, with status `PARTIAL / READY FOR LEAD INTEGRATION`; all Web-owned implementation and evidence are complete, and the exact external blockers are listed above.
