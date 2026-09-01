# Product Backend V2 Integration Requests

These requests are intentionally left for Lead/Web/Judge ownership. This worker does not edit central composition, the migration registry, Web UI, Judge, or `Docs/PROJECT_STATUS.md`.

## BACKEND-IR-MIGRATION-REGISTRY

Register Auth V2's reserved `0006`, Contest/Messaging `0007`-`0009`, and Guest Auth `0010` in the Lead-owned migration runner in that order. Run fresh up, reverse down, and up again, plus upgrade of an existing database. Current worker migration files are additive and idempotent; `scripts/migrate.mjs` still stops at `0005`.

## BACKEND-IR-CENTRAL-API-COMPOSITION

Compose `registerContestModule`, `registerSocialModule`, and Guest Auth dependencies in `apps/api/src/app.ts` with the PostgreSQL pool, trusted Auth context, audit sink, and configured Redis limiter. Guest capability must remain false/503 when its store or limiter is not available. Do not expose raw tokens, message bodies in audit, private access-code hashes, or worker/sandbox internals.

## BACKEND-IR-GUEST-CONTRACT

Update the shared Web contract so Guest responses permit `email: null`, preserve `guest: true`, and expose `upgradeHint`. Browser calls must use credentials-included same-origin cookies. Verify first use, persistent cookie resume, API restart, logout versus explicit resume revoke, and rotated-token replay rejection in the composed runtime.

## BACKEND-IR-PROBLEM-PAGINATION

Use the canonical backend response `{ items, page: { limit, offset, total, nextCursor? } }`. The `total` is a real repository count. If Web requires `{ pageSize, totalItems, totalPages }`, add an explicit adapter or versioned contract; do not alias or calculate fake totals in UI fixtures.

## BACKEND-IR-CONTEST-SUBMISSION-SCORING

Provide a public Submission create plus compensating-delete/recovery contract and an authoritative Judge verdict/scoring adapter. Until then, standings must return `available=false` and `reason=SCORING_ENGINE_NOT_INTEGRATED`; Wrong-book remains upstream-blocked.

## BACKEND-IR-MESSAGING-SHAPE

Resolve Web fields `lastMessage`, `muted`, `pinned`, and message `readState` against the persisted backend model. `clientCorrelationId` is already sourced from the durable idempotency key. Notifications require an explicit mapping from backend categories to the Web enum without inventing unread or target-route data.

## BACKEND-IR-FUTURE-DOMAINS

Create separate approved goals for Profile Activity/Heatmap, Favorites, Teams, Homework, and Wrong-book. Do not add partial fake stores to this integration.

## Verification Required By Lead

- Composed API route reachability for Auth, Guest, Contest, Social, Messaging, Notifications, Problem, Judge, and Sandbox.
- Migration registry order and fresh/existing database lifecycle.
- Browser cookie-jar Guest flow with API restart and real PostgreSQL/Redis.
- Web typed-contract compilation and runtime gap report based on `WEB_BACKEND_API_SUPPORT_MATRIX_V2.md`.
