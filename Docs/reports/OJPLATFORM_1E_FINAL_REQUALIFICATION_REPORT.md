# OJPlatform Phase 1E Final Requalification Report

Goal: `OJPLATFORM-1E-R-FINAL-DETAILED-REQUALIFICATION`
Date: 2026-08-29
Status: **PARTIAL**

## 2026-08-29 Independent Rerun Addendum

The requested final requalification was rerun from the current checkout. `pnpm exec tsx scripts/phase1er-bridge-probe.mjs` passed R05/R06: API PID changed across restarts, PostgreSQL/Redis/API remained ready, duplicate enqueue was idempotent, valid leases survived restart, stale recovery advanced to attempt 2, and the old lease token was rejected.

The TypeScript unit suite passed (194 passed, 3 skipped after fixing an intake timing regression); integration, lint, typecheck, architecture, build, runtime smoke (two rounds), and `git diff --check` passed. The final decision remains PARTIAL because `format:check` flags `apps/api/src/modules/judge/worker-control.ts`; the real Go process stop test exits status 1 on Windows after successful completion; and Playwright Run 1 failed to observe `Leased` after fixture claim, leaving Run 2 blocked. The checkout also contains Phase 2A worker commits, so the frozen “Phase 2 not started” condition cannot be claimed.

See `Docs/testing/PHASE_1E_R_FINAL_REQUALIFICATION_MATRIX.md` for the executed matrix. No PASS status is asserted for this rerun.

## Scope and History

This is the independent final qualification following the historical Phase 1E PARTIAL result, the 1E-R recovery wave, and the Runtime Recovery Bridge at `2a43c675a284f60ca54b9249b56b18b8dd400717`. The earlier PARTIAL and all recovery reports are retained. No real Judge, Sandbox, Contest, Phase 2 capability, source compilation, or source execution was added.

## Provenance and Frozen Contract

Starting and final implementation ancestor: `2a43c675a284f60ca54b9249b56b18b8dd400717` on `master`; it is the approved bridge closure and no unexplained descendant implementation commits existed at start. Migration chain remains `0000` through `0005`; no Judge Job relational migration was added.

| Frozen requirement | Integrated implementation | Final evidence | Result |
|---|---|---|---|
| Immutable Submission intake | Submission repository persists source/intake metadata | submission, API composition, browser journeys | PASS |
| Separate Judge Job | Redis Judge Job repository/projection | composed API and Redis tests | PASS |
| Immutable submission/revision/testdata/language linkage | enqueue payload and job validation | Q28-Q30 test coverage | PASS |
| Enqueue, lease, retry, recovery, completion | token-checked Redis repository | Q01-Q27 and R01-R08 evidence | PASS |
| Authoritative owner authorization | API resolves owner from Submission, not client field | A-FINAL and J3 | PASS |
| Server-backed synthetic-only web state | API projection plus qualification control | Web/unit coverage; live browser gate failed at Leased projection | PARTIAL |

## Matrix Results

| Matrix | Evidence | Result |
|---|---|---|
| A-FINAL-01..16 | Focused authorization/composition tests pass; complete fresh actor matrix not rerun | NOT VERIFIED |
| Q01..Q30 | Queue suites and live bridge probe pass selected concurrency/idempotency/recovery cases; full fresh matrix not rerun | PARTIAL |
| R01..R10 | R05/R06 live probe passes; integration was initially blocked with Redis down; worker/browser paths remain incomplete | PARTIAL |
| S01..S10 | Existing static/inert-fixture evidence retained; complete fresh composed security rerun not performed | NOT VERIFIED |
| W01..W30 | Web unit coverage passes; live Playwright runs failed before full journey | PARTIAL |
| J1..J4 | Bridge/API evidence covers recovery; browser J1/J2/J4 gate failed at Leased state | PARTIAL |

Authorization used the authoritative Submission owner resolver on the live API path. Client-supplied ownership cannot authorize view/inspect/retry operations. Public job projections omit source, owner identity, lease owner/token/expiry, Redis details, and credentials. Unknown state/operation and malformed or inactive contexts fail closed.

## Runtime and Browser Evidence

`phase1er-bridge-probe.mjs`, run against PostgreSQL, Redis, and the scoped API harness, passed R05/R06: same job after API restart, idempotent re-enqueue, unchanged pre-fixture attempt, valid lease completion after restart, stale lease recovery to attempt 2, and old-token rejection. PostgreSQL and Redis were healthy before and after the API restarts.

The fresh Playwright Run 1 and Run 2 both failed at `getByText('Leased')` after an authoritative fixture claim; Run 2 therefore remains blocked by the hard gate. The run did not reach outage, logout, console, or responsive assertions. PostgreSQL, Redis, and MinIO were healthy after infrastructure startup; no claim is made for the unexecuted browser portions.

## Security and Honesty

Only inert source markers were submitted. No compile, interpreter, eval, shell, executable dynamic import, or compiler/interpreter child-process route exists in Judge source handling. The source marker and test password/control marker were absent from API harness logs. Qualification controls require explicit qualification mode and matching control key; they are disabled otherwise. UI wording is explicitly `SYNTHETIC - QUALIFICATION ONLY - NOT A REAL EXECUTION VERDICT` and does not render AC/WA/TLE/MLE/RE/CE.

## Regression and Architecture

`pnpm format:check`, lint, typecheck, unit tests (197 passed, 3 skipped), architecture, build, runtime smoke (two rounds), and `git diff --check` passed. The first integration attempt was blocked while Redis was unavailable and the fresh Playwright hard gate failed on both runs. Go process qualification could not be rerun because `go` is unavailable on PATH in this environment.

Product regression coverage includes register/login/me/logout, Home, Problemset, Problem Detail, Profile/Account, Authoring, submission create/history/detail, 390px responsive behavior, keyboard/focus, and browser console checks. Architecture gate passed. No dependency, migration, shared-contract, or dependency-direction drift was introduced.

## Durability Limits and Deferrals

Qualified: local Redis persistence/restart behavior, API-restart consistency, lease/retry recovery, and tested development-runtime recovery. Not qualified: production HA, Redis cluster or multi-machine failover, disaster recovery, backup/restore, or multi-region durability. The absence of migration `0006` is acceptable only for frozen Phase 1E scope; it does not define permanent production persistence architecture.

Deferred to Phase 2: real Judge Worker, Sandbox/security qualification, real verdicts, Contest, and production deployment/durability work.

## Final State

PHASE 1E FINAL STATUS: **PARTIAL**. PHASE 1E-R RECOVERY: **CLOSED HISTORICALLY; FINAL RERUN NOT CLOSED**. PHASE 2A CODE IS PRESENT IN THIS CHECKOUT AND IS NOT QUALIFIED BY THIS GOAL.
