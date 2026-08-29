# PHASE 1E-R Lead Runtime Bridge Matrix

Scope: Lead-owned recovery bridge only. All synthetic transitions are qualification-only and do not execute submitted source or produce a real verdict.

| ID | Setup | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|
| B01 | Auth tip ancestry | `38fdbc4` ancestor; Auth scope only | `f6758fb` descends; Authz files/tests/report only | `git merge-base --is-ancestor` | PASS |
| B02 | Queue tip ancestry | `38fdbc4` ancestor; Queue scope only | `b745f7a` descends; 88a32cc/08793f0/b745f7a audited | Git log/diff | PASS |
| B03 | Web tip ancestry | `38fdbc4` ancestor; Web scope only | `f09bf4d` descends; Web files/tests/report only | Git diff | PASS |
| B04 | Real API owner chain | Submission owner is authoritative | Postgres `SubmissionRepository` resolver used; unrelated user denied | `judge-api-composition.test.ts`, E2E | PASS |
| B05 | Public Job projection | No lease/source/internal fields | Whitelist excludes owner, lease, token, source and Redis data | API test + R05/R06 probe | PASS |
| B06 | WSL forwarding | Keepalive remains present | Two `wsl ... sleep infinity` processes observed | process audit | PASS |
| B07 | PostgreSQL stability | Healthy through qualifications | Healthy before/between/after E2E runs | Docker inspect + `/ready` | PASS |
| B08 | Redis stability | Healthy except controlled outage | Recovered after each controlled interruption | Docker inspect + `/ready` | PASS |
| B09 | API lifecycle harness | Scoped API only stop/restart | PID tracked; health/ready polling; no broad Node kill | `api-lifecycle-harness.mjs`, R05/R06 | PASS |
| B10 | R05 enqueue/restart | Same logical job; no duplicate | Same ID, duplicate `created=false`, attempt stable | `phase1er-bridge-probe.mjs` output | PASS |
| B11 | R06 valid lease | Valid lease survives API restart | Completion using server-held lease succeeds after PID change | bridge probe output | PASS |
| B12 | R06 expiry/recovery | Expiry makes next attempt | Recovery count 1; new lease attempt 2 | bridge probe output | PASS |
| B13 | Stale completion | Old token rejected | Old token completion rejected after recovery | bridge probe output | PASS |
| B14 | Fixture default off | No control route outside explicit mode/key | Route absent without mode/key; API composition test covers | `judge-api-composition.test.ts` | PASS |
| B15 | F-SUCCESS | Queued -> leased -> synthetic completion | Real control route drove exact sequence | probe + Playwright | PASS |
| B16 | F-RETRY | Retry -> requeue -> next attempt -> complete | UI showed retry attempt 1 and lease attempt 2 | Playwright J2 | PASS |
| B17 | J1 | Real browser success journey | Auth, problem, UI submit, refresh, synthetic label, forbidden/logout | Playwright runs 1/2 | PASS |
| B18 | J2 | Real browser retry journey | Server attempt metadata matched UI; no client increment | Playwright runs 1/2 | PASS |
| B19 | J4 API outage | Transport error, not terminal Judge result | API-only stop yielded Submission unavailable; retry restored same detail | Playwright runs 1/2 | PASS |
| B20 | J4 Redis outage | Controlled degradation/recovery | Redis stop gave service error, restore made `/ready` pass | Playwright runs 1/2 | PASS |
| B21 | W11 | First complete browser run | Full J1/J2/J4 flow passed | Playwright Run 1 | PASS |
| B22 | W12 | Independent second browser run | Full J1/J2/J4 flow passed | Playwright Run 2 | PASS |
| B23 | Browser console | No unexpected console/page error | Only expected 401/404/500/502/503 during explicit paths; no page errors | E2E assertions | PASS |
| B24 | Source logging | Inert source marker absent | API harness log scan found no marker | PowerShell log scan | PASS |
| B25 | Secret logging | Password/control markers absent | API harness log scan found none | PowerShell log scan | PASS |
| B26 | Synthetic honesty | No AC/WA/TLE/MLE/RE/CE | UI explicit qualification-only, non-verdict wording | E2E + Web recovery tests | PASS |
| B27 | Source execution | No execution primitive | No source execution invoked; static scan and Queue guard tests pass | queue tests + probe | PASS |
| B28 | Shared services after Run 1 | All healthy | API ok; PostgreSQL/Redis/MinIO healthy | Docker inspect + `/ready` | PASS |
| B29 | Shared services after Run 2 | All healthy | API ok; PostgreSQL/Redis/MinIO healthy | Docker inspect + `/ready` | PASS |
| B30 | Relevant regression | All required gates pass | format, lint, typecheck, test, integration, architecture, build, runtime smoke, diff check | command records | PASS |

Expected browser resource errors during the intentional 401/404, API outage, and Redis outage paths were classified in the E2E assertions. No unexpected console errors or unhandled page errors were accepted.
