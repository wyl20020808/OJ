# OJPlatform Product Backend Contest Messaging Foundation V1 Report

## Result

Status: PARTIAL - Product Backend Worker implementation and owned verification are complete; production route composition, migration registration, authoritative standings, and the cross-module Submission adapter remain Lead-owned Integration Requests. No fake score, friend, chat, notification, or in-memory persistence is presented as a production result.

- Branch: `codex/product-backend-contest-messaging-foundation-v1`
- Starting HEAD: `73537b6a3728d6b986d5a8f265db3ba4702a0ca0`
- Final HEAD: recorded by the final delivery command after this report commit; a commit cannot contain its own final object hash without changing that hash.
- Commits: `feat: add contest messaging backend foundation` (final hash recorded in the delivery response)
- Worktree before implementation: clean

## Delivered Schema and API

Migrations are additive and keep Auth V2's `0006` reserved:

- `0007_contest_foundation`: contests, roles, ordered problem membership, registrations, submission bindings, checks, and listing indexes.
- `0008_social_messaging_foundation`: pending friend-request uniqueness by canonical pair, canonical friendships, one direct conversation per canonical pair, members, durable text messages, idempotency key, and cursor index.
- `0009_notifications_foundation`: durable notifications, constrained categories and routes, cursor and unread indexes.

`apps/api/src/modules/contest/index.ts` provides contest list/home summary, create/update/publish/cancel, owner/manager checks, problem ordering, registration/withdrawal, participant and own-submission listing, and an honest standings response: `{ available: false, reason: "SCORING_ENGINE_NOT_INTEGRATED" }`.

`apps/api/src/modules/social/index.ts` provides minimal safe user search, friend request lifecycle, canonical friendship/unfriend, direct conversations, text persistence, `clientMessageId` idempotency, cursor pagination, read/unread state, and notification APIs. `RedisFixedWindowLimiter` uses Redis `INCR`/`EXPIRE` atomically and the social module fails closed with `429 RATE_LIMITED` when the limiter fails.

## Security, Privacy, and Transactions

- Auth is injected from the trusted composition boundary; anonymous writes are rejected.
- Contest owner/manager and private-contest registration checks are database-backed. Registration never accepts a user identity from a payload.
- Private access codes are scrypt hashes only. Safe user search projects only id, username, and display name.
- Conversation membership is checked for every message/read/list operation. Message body is never passed to audit.
- Friend request and notification, friend accept/friendship/notification, conversation/member creation, and message/notification writes use PostgreSQL transactions.
- Duplicate message retries return the original row and do not create another direct-message notification.
- Cross-module contest submission creation remains unavailable without both create and compensating delete public contracts. A binding failure attempts compensation; recovery failure is explicit. This avoids silently creating an unbound formal submission.
- No changes were made to Judge, Sandbox, runc, Judge Queue, Auth password/OAuth core, Web UI, `PROJECT_STATUS.md`, Lead API composition, or the migration registry.

## Runtime Evidence

Real local PostgreSQL and Redis were healthy. `tests/contest-social-foundation.integration.test.ts` applies `0007`-`0009` idempotently to PostgreSQL, inserts isolated fixtures, and verifies:

- private contest create, owner role, hidden detail, access-code registration, participant access after registration, API restart persistence, and honest standings;
- canonical friendship, direct conversation, durable messages, duplicate client-message retry, notification deduplication, concurrent independent sends, and unread counts;
- real Redis fixed-window limit enforcement and fail-closed limiter failure.

`EXPLAIN` evidence showed `contests_public_listing_idx` for public listings, `notifications_unread_idx` for unread notifications, and `messages_conversation_cursor_idx` for message cursors.

## Acceptance Matrix

The code and focused real integration cover the principal CON-BE and MSG-BE behavior. The following still require Lead-owned composed API/runtime evidence or the requested authoritative external contract, so the full matrices are not claimed PASS:

- CON-BE-34 through CON-BE-37: formal Submission/Judge integration is intentionally unavailable pending `BACKEND-IR-AUTHORITATIVE-CONTEST-SCORING`.
- CON-BE-42: contest route rate-limit wiring is a composition decision.
- CON-BE-43 through CON-BE-45: worker migration and transaction behavior is tested against an existing local database, but fresh isolated database, runner down/up, and registry-order qualification require the Lead migration runner.
- MSG-BE-47 through MSG-BE-53: database uniqueness and sequential/idempotent retry behavior are implemented; full concurrent accept/conversation/duplicate-message, rollback injection, fresh-database, and migration-runner compatibility qualification remain to be broadened by Lead integration.
- Audit hook contracts are invoked for contest and social writes without body/source/session data. Durable audit persistence is owned by the existing Auth/Audit composition and is not independently runtime-qualified here.

## Web V4 Alignment

Backend preserves Web V4 concepts where safe: `privatePassword` for privileged writes, `accessCode` for registration, and response `clientCorrelationId` from persisted `clientMessageId`. The V1 backend supports direct conversations only and stores domain notification categories. The precise required adapter/mapping is recorded in `WEB-V4-BACKEND-CONTRACT-INTEGRATION-REQUEST`.

## Quality Gates

Executed successfully:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` - 24 passed files, 1 skipped; 336 passed tests, 4 skipped
- `pnpm test:architecture`
- `pnpm build`
- `pnpm vitest run tests/contest-social-foundation.integration.test.ts` - 3 passed real PostgreSQL/Redis tests
- `git diff --check`

## Integration Requests and Handoff

All requests are in `Docs/parallel/PRODUCT_BACKEND_CONTEST_MESSAGING_INTEGRATION_REQUESTS.md`:

1. `BACKEND-IR-MIGRATION-REGISTRY`
2. `BACKEND-IR-API-COMPOSITION`
3. `WEB-V4-BACKEND-CONTRACT-INTEGRATION-REQUEST`
4. `BACKEND-IR-AUTHORITATIVE-CONTEST-SCORING`

READY FOR LEAD INTEGRATION: YES - worker-owned code, migrations, tests, and explicit limits are ready for review. This is not a claim that Lead integration or full production qualification has occurred.

## Final Git Status

After the worker commit, `git status --short --branch` is clean on `codex/product-backend-contest-messaging-foundation-v1`.
