# OJPlatform 1E-R Web Judge Status Recovery Report

## 1. Executive status

`PARTIAL`: Web-owned Judge status behavior is implemented and tested. The UI is contract-faithful, server-backed, refresh-safe, authorization-safe at its public surfaces, accessible, responsive, and non-deceptive. Real multi-stage Judge transitions and full browser journeys remain blocked by Lead-owned runtime/fixture orchestration.

## 2. Worktree / branch

Worktree: `D:\OJPlatform-worktrees\phase1b-web-authoring`  
Branch: `codex/phase1er-judge-ui-recovery`

## 3. Starting HEAD

`38fdbc48695f8851df47d7ae433eb551b9b340a4` (`docs: record phase 1E qualification status`)

## 4. Final HEAD

Recorded after the scoped commit below.

## 5. Commits

One scoped recovery commit containing Web behavior, Web tests, Playwright journey specifications, and this report.

## 6. Files/modules changed

- `apps/web/src/app/App.tsx`: explicit non-executing leased wording, semantic status role, request sequencing, transport-error retry UX.
- `apps/web/src/services/api.ts`: public HTTP status retained on `ApiError`.
- `tests/web-recovery.test.tsx`: W01-W30 Web recovery evidence.
- `tests/e2e/phase1e-r-judge-status-journeys.spec.ts`: J1-J4 real-runtime-ready specs, skipped unless Lead fixture is enabled.
- This report.

No API internals, Auth, Redis, queue, shared contracts, root manifests, or `Docs/PROJECT_STATUS.md` were changed.

## 7. Existing UI audit

Submission history and detail already consumed the projected public Submission object and rendered the same `JudgeStatus` mapping. The recovery retained that structure and made only Web-owned robustness changes.

## 8. Public API fields consumed

Submission identity: `id`, `ownerUserId`, `problemId`, `problemRevisionId`, `languageId`, `createdAt`.  
Judge projection: `status`, `judgeJobId`, `attempt`, `maxAttempts`, `retryAt`, `failureCode`, `synthetic`.  
Source: `source`, rendered only as a React text child in `pre.source`.  
No internal Redis fields, lease tokens, credentials, or worker internals are consumed.

## 9. State mapping table

| API state | User-facing label | Tone/meaning | Terminal | Refresh behavior | Actions |
|---|---|---|---|---|---|
| `PENDING` | Pending intake | Intake has not reached the protocol queue | No | Re-fetches server state | None |
| `QUEUED` | Queued | Waiting for protocol worker; no result | No | Re-fetches server state | None |
| `LEASED` | Leased | Synthetic protocol qualification; submitted code is not executed | No | Re-fetches server state | None |
| `RUNNING` | Running | Synthetic qualification state only | No | Re-fetches server state | None |
| `RETRYABLE_FAILURE` | Retryable protocol failure | Infrastructure/protocol attempt may retry; not a source verdict | No | Re-fetches server state | None in Web |
| `PROTOCOL_FAILURE` | Terminal protocol failure | Intake stopped before an execution result | Yes | Re-fetch remains terminal if server says so | None |
| `SYNTHETIC_COMPLETED` | Synthetic completion | Qualification plumbing completed, not correctness | Yes | Re-fetch remains synthetic | None |
| unknown | Unknown protocol state | Neutral unsupported state; refresh may recover | Unknown | Re-fetches server state | None |

## 10. Refresh/revalidation behavior

History and detail fetch on mount from the public API. There is no client-side status progression or fake timer. Manual retry re-fetches the current server state. Request version guards prevent an older response from replacing a newer response.

## 11. Polling behavior, if any

There is no Judge polling in the current Web architecture; no polling was invented. The Lead journey controls refresh/re-fetch explicitly.

## 12. Unknown-state behavior

Unknown values render `Unknown protocol state` with a neutral note and never map to success or a real verdict.

## 13. 401/403/404/5xx/network behavior

Unauthenticated protected routes show `Sign in required` and no protected data. Forbidden and not-found errors have separate stable UI. HTTP 5xx retains infrastructure error semantics and exposes a retry action on detail. Network failures render `The service could not be reached.` with retry. None maps to Judge terminal failure or AC/WA/TLE/MLE/RE/CE.

## 14. Synthetic honesty proof

Synthetic completion visibly renders `SYNTHETIC · QUALIFICATION ONLY · NOT A REAL EXECUTION VERDICT`. Leased/running wording explicitly says submitted code is not executed. Synthetic tone is not the existing green Accepted styling.

## 15. Source rendering safety

Source is passed as a React text child in `<pre className="source">`; `<script>`, HTML-like, eval-like, and shell-like strings remain inert. The recovery tests assert no script element is created.

## 16. Protected-cache/logout behavior

The Web layer has no persistent protected-content cache. User and page state are held in React memory only. Logout clears the user and navigates home; protected submission content is removed from the DOM. W14 executes this assertion.

## 17. Browser harness audit

Playwright uses `scripts/start-api.mjs` and the Web preview as its own processes. No Web Playwright global teardown, `docker compose down`, `docker stop`, `docker rm`, WSL shutdown, or shared-service kill was found. `scripts/runtime-smoke.mjs` uses `taskkill` only for its own child on its isolated port `3020`.

## 18. Runtime lifecycle diagnosis

`WEB-OWNED PREMATURE TEARDOWN = NO`. Lead runtime lifecycle remains the owner of shared PostgreSQL/Redis/MinIO and full Playwright sequencing. The local qualification used `OJPLATFORM_INFRA=false` in-memory API mode and therefore does not qualify durable shared runtime transitions.

## 19. W01-W30 result matrix

| ID | Result | Evidence |
|---|---|---|
| W01 | PASS | `web-recovery.test.tsx` |
| W02 | PASS | `web-recovery.test.tsx` |
| W03 | PASS | `web-recovery.test.tsx` |
| W04 | PASS | `web-recovery.test.tsx` |
| W05 | PASS | `web-recovery.test.tsx` |
| W06 | PASS | server projection and refresh mapping tests |
| W07 | PASS | shared `presentJudgeStatus` projection test |
| W08 | PASS | forbidden surface and no-leak test |
| W09 | PASS | unknown-state test |
| W10 | PASS | forbidden-verdict scan test |
| W11 | BLOCKED | Lead-owned real runtime fixture absent; journey spec is runnable when enabled |
| W12 | BLOCKED | Lead-owned real runtime fixture absent; journey spec is runnable when enabled |
| W13 | PASS | unauthenticated protected-route test |
| W14 | PASS | logout DOM/cache safety test |
| W15 | PASS | network error remains transport error |
| W16 | PASS | HTTP 503 preserves `ApiError.status` |
| W17 | PASS | inert source regression in existing Web test |
| W18 | PASS | request version guards plus deterministic recovery coverage |
| W19 | PASS | audit confirms no polling/timer exists |
| W20 | PASS | optional metadata omission test |
| W21 | PASS | failure-code rendering test |
| W22 | PASS | attempt only when public field exists |
| W23 | PASS | 390px browser viewport had no horizontal overflow |
| W24 | PASS | semantic status role and visible focus CSS |
| W25 | PASS | browser console error log empty |
| W26 | PASS | existing submission regression tests |
| W27 | PASS | existing problem detail regression tests |
| W28 | PASS | existing profile/account regression tests |
| W29 | PASS | existing authoring regression tests |
| W30 | PASS | existing home/problemset regression tests |

## 20. Journey J1 result

`BLOCKED`: synthetic success transition requires a Lead-owned fake-worker/runtime fixture. No UI-only transition was added.

## 21. Journey J2 result

`BLOCKED`: retry/requeue control path is not Web-owned and no shared fixture was available.

## 22. Journey J3 result

`READY`: Web forbidden surface is covered; full two-user API authorization journey remains Lead/Auth integration evidence.

## 23. Journey J4 result

`BLOCKED`: controlled API/Redis failure injection and restoration are Lead-owned.

## 24. Desktop/mobile regression

Desktop browser inspection reached the available 1280px viewport (requested approximately 1440px) with document `scrollWidth` below viewport width. At 390x844, `scrollWidth` was 375 due to the scrollbar and no horizontal overflow was present. Long synthetic text wraps through the existing flex layout.

## 25. Accessibility

Status blocks now expose `role="status"` and an accessible label containing both state and meaning. Loading/error surfaces retain semantic `role="status"`/`role="alert"`; buttons and links retain visible focus styling; heading structure remains intact.

## 26. Browser console

Representative local browser inspection: no `error` console entries. Playwright emitted only environment `NO_COLOR` warnings while starting servers.

## 27. Existing product regression

`pnpm test` passed all 82 tests. Existing Home, Problemset, Problem Detail, Login/Register, Profile, Authoring, Submission form, history, and detail coverage remained green.

## 28. Integration Requests

### IR-1: Lead real Judge status fixture

**Problem:** J1/J2/J4 and W11/W12 cannot execute real server-backed transitions or failure injection without shared runtime controls.  
**Evidence:** targeted Playwright run completed with 4 intentional skips because `OJPLATFORM_PHASE1E_REAL_RUNTIME` was not enabled; API was run in in-memory mode.  
**Required Lead-owned change:** provide a stable PostgreSQL/Redis-backed Playwright fixture or documented control path that advances one owned submission through `QUEUED`, `LEASED`, retryable failure, and synthetic completion, plus controlled outage/restore.  
**File/module:** Lead Playwright runtime setup and fake-worker fixture; do not change Web contract.  
**Expected contract:** public Submission projection changes server-side and survives reload; outage returns HTTP/network failure without fabricated status.  
**Requalification:** run `OJPLATFORM_PHASE1E_REAL_RUNTIME=true pnpm exec playwright test tests/e2e/phase1e-r-judge-status-journeys.spec.ts --workers=1` twice, then rerun W06-W18 and W23-W25.

## 29. Dependency Requests

None. No dependency was added.

## 30. Known limitations

Full real runtime durability, Redis interruption/reconnect, API restart, two-user composed authorization, and failure injection remain outside Web ownership. The branch does not claim real Judge execution or production readiness.

## 31. Test commands/counts

- `pnpm test`: PASS, 12 files / 82 tests.
- `pnpm test:web`: PASS, 11 tests.
- `pnpm exec vitest run tests/web-recovery.test.tsx`: PASS, 31 tests.
- `pnpm exec playwright test tests/e2e/phase1e-r-judge-status-journeys.spec.ts --workers=1`: 4 skipped due to missing Lead fixture.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `pnpm test:architecture`: PASS.
- `pnpm format:check`: PASS.
- `git diff --check`: PASS.

## 32. Final git status

Must be clean after the scoped recovery commit.

## 33. READY FOR LEAD REQUALIFICATION = YES / NO

`YES` for Web-owned recovery and Lead requalification handoff. Full Phase 1E remains `PARTIAL` until IR-1 is executed.
