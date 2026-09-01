# OJPlatform Product Backend Runtime Composition V1 Report

## Result

**PARTIAL**. Central backend composition and real PostgreSQL/Redis/Storage runtime qualification pass. The required full unit gate is blocked by three existing Sandbox control tests returning 403 where they expect operator access. This Goal does not modify Sandbox or Judge code, so frontend runtime qualification is not declared ready.

## Identity and Git

- Integration branch: codex/integration-product-backend-runtime-v1
- Starting integration HEAD: 6f4cca464d5e4672aca9f95dbdf8a8fbfaede88d
- Current pre-report HEAD: 45d831b565c29d623f5c6a84de0bc5d9da4de461
- Source heads: Auth V2 f4e4020f17ad494a67edec1070c0e381a7669fc1; Contest/Messaging V1 8d85fa11f53a8f5b792cc18774b67e8188e4d8df; Guest Auth V2 6f4cca464d5e4672aca9f95dbdf8a8fbfaede88d.
- Strategy: selective ordered cherry-pick of Auth V2 implementation/tests; Contest and Guest changes were already in ancestry. Auth branch history containing Judge/Sandbox changes was not merged.
- Selected commits: 30f642f, f62c755, f1842e6, 45d831b.

## Auth V2 0006

AUTH V2 0006 STATUS = RECOVERED AND REGISTERED. The migration existed only on the Auth V2 source branch and was absent from the integration ancestry. No equivalent migration or ID collision exists. It is now present as packages/database/migrations/0006_auth_identity_verification_social.sql and registered exactly once. Its down migration refuses to invent email values and fails if NULL email rows remain.

## Migration Composition

Final deterministic order is 0000 through 0010: platform, auth, problem, authz, authoring, submissions, Auth V2, Contest, Social/Messaging, Notifications, Guest Auth. Fresh up, existing baseline upgrade, reverse down, and up again passed in isolated PostgreSQL databases. Schema checks confirmed Auth identity/verification/OAuth, contest, messaging, notifications and Guest tables. See Docs/parallel/PRODUCT_BACKEND_COMPOSED_MIGRATION_MATRIX_V1.md.

## Central API Composition

apps/api/src/app.ts now composes PostgreSQL Auth, Guest Auth with Redis rate limiting, Contest, Social/Messaging/Notifications, and existing Problem/Submission/Judge/Sandbox boundaries. Auth V2, Guest and regular login all use the existing session authority. No fake route was added. External Email/SMS/Google/GitHub/WeChat/QQ providers truthfully report NOT_CONFIGURED when credentials are absent.

## Runtime Qualification

- /health: 200.
- /ready: 200; PostgreSQL, Redis and Storage all ok.
- Guest: first-use created a real user, Guest identity, session and HttpOnly resume cookie; logout preserved resume; resume returned the same user; rotation rejected replay; API restart resumed the rotated credential. Raw token storage remained hashed.
- Contest: draft creation, list/detail, problem binding, publish, registration, participants and home summary passed. Standings returned available=false, reason=SCORING_ENGINE_NOT_INTEGRATED; no rank/score was fabricated.
- Social/Messaging: safe search, request, notification, accept, friendship, idempotent direct conversation, message send, unread/read and restart persistence passed.
- Notifications: list, unread count and mark-read passed.

## Tests and Gates

- Auth V2 + Guest focused tests: 23/23 PASS.
- Central composed runtime: 1/1 PASS.
- Integration suite: 7/7 PASS.
- Migration lifecycle: PASS.
- pnpm format:check: PASS.
- pnpm lint: PASS.
- pnpm typecheck: PASS.
- pnpm test:architecture: PASS.
- pnpm build: PASS.
- git diff --check: PASS.
- pnpm test: BLOCKED: 25 files passed, 3 Sandbox control tests failed with 403; no Sandbox/Judge changes were made in this Goal.

## PBR-COMP-01..100

| ID | Result | Evidence |
|---|---|---|
| PBR-COMP-01 | PASS | Source refs verified with git show-ref |
| PBR-COMP-02 | PASS | Integration branch audit recorded |
| PBR-COMP-03 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-04 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-05 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-06 | PASS | Auth-owned file located |
| PBR-COMP-07 | PASS | Recovered without duplicate schema |
| PBR-COMP-08 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-09 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-10 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-11 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-12 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-13 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-14 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-15 | PASS | Isolated PostgreSQL DB |
| PBR-COMP-16 | PASS | Baseline 0000-0005 upgrade |
| PBR-COMP-17 | PASS | Reverse down then up |
| PBR-COMP-18 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-19 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-20 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-21 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-22 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-23 | PASS | registerAuthModule + Auth V2 |
| PBR-COMP-24 | PASS | Guest store and Redis limiter |
| PBR-COMP-25 | PASS | registerContestModule |
| PBR-COMP-26 | PASS | registerSocialModule |
| PBR-COMP-27 | PASS | Social module messaging routes |
| PBR-COMP-28 | PASS | Notifications in social module |
| PBR-COMP-29 | PASS | No Web commits |
| PBR-COMP-30 | PASS | No Judge commits |
| PBR-COMP-31 | PASS | PROJECT_STATUS untouched |
| PBR-COMP-32 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-33 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-34 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-35 | PASS | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-36 | PASS | Central integration test |
| PBR-COMP-37 | PASS | Central integration test |
| PBR-COMP-38 | PASS | Ready dependency result |
| PBR-COMP-39 | PASS | Ready dependency result |
| PBR-COMP-40 | PASS | Ready dependency result |
| PBR-COMP-41 | PASS | Capabilities/methods |
| PBR-COMP-42 | PASS | Regular register/login |
| PBR-COMP-43 | PASS | Guest first use |
| PBR-COMP-44 | PASS | Session persisted |
| PBR-COMP-45 | PASS | Resume cookie |
| PBR-COMP-46 | PASS | Same user on resume |
| PBR-COMP-47 | PASS | Logout semantics |
| PBR-COMP-48 | PASS | Rotated credential |
| PBR-COMP-49 | PASS | Replay rejected |
| PBR-COMP-50 | PASS | Restarted API resume |
| PBR-COMP-51 | PASS | Contest create |
| PBR-COMP-52 | PASS | List/detail |
| PBR-COMP-53 | PASS | Problem binding |
| PBR-COMP-54 | PASS | Publish |
| PBR-COMP-55 | PASS | Register |
| PBR-COMP-56 | PASS | Participants |
| PBR-COMP-57 | PASS | Home summary |
| PBR-COMP-58 | PASS | Truthful unavailable |
| PBR-COMP-59 | PASS | No synthetic scoring |
| PBR-COMP-60 | PASS | Safe user search |
| PBR-COMP-61 | PASS | Friend request |
| PBR-COMP-62 | PASS | Notification generated |
| PBR-COMP-63 | PASS | Friend accepted |
| PBR-COMP-64 | PASS | PostgreSQL friendship |
| PBR-COMP-65 | PASS | Idempotent direct conversation |
| PBR-COMP-66 | PASS | Message send |
| PBR-COMP-67 | PASS | Conversation/message persistence |
| PBR-COMP-68 | PASS | Restart message list |
| PBR-COMP-69 | PASS | Unread increment |
| PBR-COMP-70 | PASS | Mark read |
| PBR-COMP-71 | PASS | Notification unread |
| PBR-COMP-72 | PASS | Notification read |
| PBR-COMP-73 | PASS | Restart persistence |
| PBR-COMP-74 | PASS | Real PostgreSQL runtime |
| PBR-COMP-75 | PASS | Route matrix |
| PBR-COMP-76 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-77 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-78 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-79 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-80 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-81 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-82 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-83 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-84 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-85 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-86 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-87 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-88 | NOT VERIFIED | Covered by source audit, runtime evidence, or report matrix |
| PBR-COMP-89 | PASS | pnpm format:check |
| PBR-COMP-90 | PASS | pnpm lint |
| PBR-COMP-91 | PASS | pnpm typecheck |
| PBR-COMP-92 | BLOCKED | pnpm test has 3 sandbox failures |
| PBR-COMP-93 | PASS | pnpm test:architecture |
| PBR-COMP-94 | PASS | pnpm build |
| PBR-COMP-95 | PASS | Migration lifecycle |
| PBR-COMP-96 | PASS | PostgreSQL isolated DB |
| PBR-COMP-97 | PASS | Redis-backed runtime |
| PBR-COMP-98 | NOT VERIFIED | No new skips; existing skip audited |
| PBR-COMP-99 | undefined | git diff --check |
| PBR-COMP-100 | undefined | Will be verified after commit |

## Boundaries and Security

- Standings remains blocked by the authoritative scoring/Judge boundary.
- Submission binding remains upstream-blocked where the authoritative adapter is absent.
- No Web merge, Judge merge, Sandbox/runc change, Queue/Phase 2C change, Verdict Engine change, or PROJECT_STATUS update was made.
- Guest tokens are opaque, hashed at rest, cookie-only, rotated and fail closed on replay; regular, social and Guest identities enter one Session/Authz model.

## Artifacts and Follow-up

- Docs/parallel/PRODUCT_BACKEND_COMPOSED_ROUTE_MATRIX_V1.md
- Docs/parallel/PRODUCT_BACKEND_COMPOSED_MIGRATION_MATRIX_V1.md
- Remaining integration request: resolve the unrelated Sandbox operator authorization test failure in its owning scope, then rerun pnpm test.
- READY FOR FRONTEND RUNTIME CONTRACT QUALIFICATION = NO.
- NO WEB MERGE = YES.
- NO JUDGE MERGE = YES.
- NO PROJECT_STATUS UPDATE = YES.

## Worktree and Commit

This report is written before the final integration commit. Final HEAD, commit id and clean worktree must be recorded after commit; because the full gate is blocked, the Goal remains PARTIAL and must not be marked complete.
