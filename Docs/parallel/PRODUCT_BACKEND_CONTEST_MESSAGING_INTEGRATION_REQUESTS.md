# Product Backend Contest Messaging Integration Requests

## BACKEND-IR-MIGRATION-REGISTRY

INTEGRATION REQUEST:
- requested change: register `0007_contest_foundation`, `0008_social_messaging_foundation`, and `0009_notifications_foundation` after Auth V2's reserved `0006_auth_identity_verification_social` in the Lead-owned migration runner.
- reason: the worker must not change the shared migration registry. The migrations are additive and idempotent, but are not run by `pnpm db:migrate` until registered.
- affected file: `scripts/migrate.mjs`.
- expected contract impact: additive PostgreSQL tables and indexes only; no existing migration is changed.
- tests required: fresh database up/down/up, existing database upgrade, and migration-order assertion that `0006` remains Auth V2-owned.
- decision: pending Lead Integration.

## BACKEND-IR-API-COMPOSITION

INTEGRATION REQUEST:
- requested change: compose `registerContestModule` and `registerSocialModule` in the Lead-owned API bootstrap with the PostgreSQL pool, authenticated identity resolver, audit sink, problem resolver, and `RedisFixedWindowLimiter` backed by the configured Redis client.
- reason: standalone modules have no route reachability in the production API until central composition supplies trusted dependencies.
- affected file: `apps/api/src/app.ts` and the Lead-owned composition tests.
- expected contract impact: additive authenticated `/api/contests`, social, messaging, and notification routes; no Auth core change.
- tests required: composed API authentication, inactive-account handling, audit persistence, Redis-unavailable fail-closed behavior, and restart persistence.
- decision: pending Lead Integration.

## WEB-V4-BACKEND-CONTRACT-INTEGRATION-REQUEST

INTEGRATION REQUEST:
- requested change: resolve the remaining typed-contract differences before Web V4 is connected to these routes.
- reason: Contest uses `privatePassword` only for privileged create/update and `accessCode` only for registration; messages return `clientCorrelationId` from persistent `clientMessageId`; V1 supports only `DIRECT` conversations; persisted notification categories are `FRIEND_REQUEST`, `FRIEND_ACCEPTED`, `DIRECT_MESSAGE`, and `CONTEST`; notification routes are allow-listed and do not include user-derived query strings.
- affected file: Web V4 typed API adapter/contracts and Lead composition contract tests; do not change the Web UI in this worker scope.
- expected contract impact: an explicit adapter or approved additive enum mapping, with no exposure of private access-code hashes or message text in audit data.
- tests required: typed client compile, create/register private contest flow, direct-message retry, notification projection, and unsupported group-conversation handling.
- decision: pending Web/Lead decision.

## BACKEND-IR-AUTHORITATIVE-CONTEST-SCORING

INTEGRATION REQUEST:
- requested change: provide an authoritative Judge verdict/scoring adapter and a transaction-aware public Submission contract for contest submission binding.
- reason: this worker intentionally returns `SCORING_ENGINE_NOT_INTEGRATED` for standings and keeps contest submission creation unavailable unless the public Submission boundary provides create plus compensating delete. It must not infer scores from execution data.
- affected file: Judge/Submission public contracts and Lead API composition; no Judge internals are modified here.
- expected contract impact: explicit authoritative verdict/scoring and transaction/recovery semantics.
- tests required: scoring provenance, binding failure compensation, retry recovery, and no orphan submission or fabricated standing.
- decision: pending architecture/Lead decision.
