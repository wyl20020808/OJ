# OJPlatform Phase 1E Final Requalification Report

Goal: `OJPLATFORM-1E-R-FINAL-DETAILED-REQUALIFICATION`
Date: 2026-08-29
Status: **PASS**

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
| Server-backed synthetic-only web state | API projection plus qualification control | W01-W30, J1-J4, Playwright x2 | PASS |

## Matrix Results

| Matrix | Evidence | Result |
|---|---|---|
| A-FINAL-01..16 | `judge-api-composition`, `judge-authz`, `submission-authz`, real J3 browser denial; owner, unrelated, operator/ordinary, inactive/malformed/unknown fail closed, forged owner denial, no job side effect | PASS |
| Q01..Q30 | `judge-queue`, `judge-queue-redis`, composed R05/R06 probe; real concurrent duplicate enqueue and concurrent claim, token/race/retry/terminal/reconnect/immutability/isolation coverage | PASS |
| R01..R10 | unavailable/disconnect/reconnect/restart queue tests; live Redis restart; scoped API lifecycle R05/R06; worker pre-ack recovery; malformed payload handling; J4 runtime recovery | PASS |
| S01..S10 | static execution-primitive audit, queue guard tests, inert-marker runtime runs, API harness log scan, projection/browser checks | PASS |
| W01..W30 | `web-recovery.test.tsx` plus two real server-backed Playwright runs; mobile, focus, error, protected-cache, product regression assertions | PASS |
| J1..J4 | two independent real browser journeys covering synthetic success, retry/requeue, forbidden user, API/Redis recovery | PASS |

Authorization used the authoritative Submission owner resolver on the live API path. Client-supplied ownership cannot authorize view/inspect/retry operations. Public job projections omit source, owner identity, lease owner/token/expiry, Redis details, and credentials. Unknown state/operation and malformed or inactive contexts fail closed.

## Runtime and Browser Evidence

`phase1er-bridge-probe.mjs`, run against PostgreSQL, Redis, and the scoped API harness, passed R05/R06: same job after API restart, idempotent re-enqueue, unchanged pre-fixture attempt, valid lease completion after restart, stale lease recovery to attempt 2, and old-token rejection. PostgreSQL and Redis were healthy before and after the API restarts.

Playwright Run 1 and Run 2 both passed the real runtime suite with separate test-owned accounts/data. Each exercised UI registration/login, real Problem/Submission creation, Redis-backed Job transitions, synthetic completion, retry/requeue, cross-user denial, Redis stop/start, scoped API stop/start, refresh, logout and protected-detail denial. The intentional outage paths produced service-unavailable UI, never a Judge verdict. After both runs PostgreSQL, Redis, MinIO, and `/ready` were healthy; the WSL keepalive remained active. Browser console/page errors were clean except expected resource messages during explicit API/Redis outage injection.

## Security and Honesty

Only inert source markers were submitted. No compile, interpreter, eval, shell, executable dynamic import, or compiler/interpreter child-process route exists in Judge source handling. The source marker and test password/control marker were absent from API harness logs. Qualification controls require explicit qualification mode and matching control key; they are disabled otherwise. UI wording is explicitly `SYNTHETIC - QUALIFICATION ONLY - NOT A REAL EXECUTION VERDICT` and does not render AC/WA/TLE/MLE/RE/CE.

## Regression and Architecture

PASS: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (114 passed, 3 opt-in Redis skipped), targeted Judge/Web suites (78 passed, 3 opt-in Redis skipped), `pnpm integration` (4 passed), `pnpm test:architecture`, `pnpm build`, `pnpm runtime:smoke` (two rounds), API smoke, Playwright Run 1, Playwright Run 2, and `git diff --check`.

Product regression coverage includes register/login/me/logout, Home, Problemset, Problem Detail, Profile/Account, Authoring, submission create/history/detail, 390px responsive behavior, keyboard/focus, and browser console checks. Architecture gate passed. No dependency, migration, shared-contract, or dependency-direction drift was introduced.

## Durability Limits and Deferrals

Qualified: local Redis persistence/restart behavior, API-restart consistency, lease/retry recovery, and tested development-runtime recovery. Not qualified: production HA, Redis cluster or multi-machine failover, disaster recovery, backup/restore, or multi-region durability. The absence of migration `0006` is acceptable only for frozen Phase 1E scope; it does not define permanent production persistence architecture.

Deferred to Phase 2: real Judge Worker, Sandbox/security qualification, real verdicts, Contest, and production deployment/durability work.

## Final State

PHASE 1E FINAL STATUS: **PASS**. PHASE 1E-R RECOVERY: **CLOSED**. PHASE 2: **NOT STARTED**.
