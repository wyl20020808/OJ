# PHASE 1A Shared Contract

Goal: `OJPLATFORM-1A-CORE-PRODUCT-FOUNDATION`
Status: Bootstrap contract, frozen by the Phase 1A Bootstrap commit.

Workers A, B, and C MUST treat this file as read-only. Any required change is an Integration Request for Lead review.

## 1. User Public Model

`User` is the public identity resource: `id`, `username`, `email`, `displayName`, `status` (`active|disabled`), `createdAt`, and `updatedAt`. Password hashes, sessions, tokens, recovery secrets, and security metadata are never public fields.

## 2. Auth Public API Contract

The API exposes versioned HTTP endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me`. Register and login accept validated credentials and return the authenticated-user representation; logout revokes the current server-side session. Auth failures use the shared error contract and do not reveal whether a credential or account exists beyond the documented duplicate-registration response.

## 3. Authenticated User Representation

`AuthenticatedUser` contains `id`, `username`, `email`, `displayName`, and `status: active`. Requests carry an internal `AuthContext` with `userId` and authentication strength/session id; modules consume the public context/policy interface, never Auth repositories.

## 4. Authentication Boundary

Auth owns credential verification and session lifecycle. Passwords are accepted only at the API boundary, hashed with a current memory-hard password hashing strategy (Argon2id when the implementation phase selects the library), and are never logged or returned. The default strategy is opaque, server-side, revocable sessions identified by an `HttpOnly`, `Secure` (production), `SameSite=Lax` cookie. Development may use `Secure=false` only on explicitly local HTTP configuration. No browser localStorage token storage is permitted. Disabled users cannot authenticate and existing sessions are rejected/revoked.

## 5. Problem Public Model

`Problem` contains `id`, `slug`, `title`, `statement`, `inputDescription`, `outputDescription`, `examples`, `constraints`, `notes`, `timeLimitMs`, `memoryLimitBytes`, `visibility`, `status`, `testdataVersion`, `authorId` (nullable future owner reference), `createdAt`, and `updatedAt`. Examples are structured input/output/note records; statement-like fields are rendered as text/markdown under a later explicit rendering policy.

## 6. Problem Status / Visibility

`status` is lifecycle (`draft|published|archived`); `visibility` is audience (`private|public`). Only published public problems are generally listable. Draft/private and archived resources require the owning authorization policy. Transitions are explicit and auditable; no transition executes judge work.

## 7. Problem Statement Representation

Statement, input, output, constraints, and notes are bounded UTF-8 strings. The API returns the canonical stored representation and does not execute or evaluate embedded code. Examples are bounded structured values.

## 8. Testdata Version Reference

`testdataVersion` is an immutable opaque version/reference (or null before one is attached), not testcase contents. It identifies metadata in Storage/Problem ownership; formal submissions must retain the exact problem and testdata versions used.

## 9. Problem Public API Contract

The API exposes `GET /api/problems`, `GET /api/problems/:idOrSlug`, `POST /api/problems`, `PATCH /api/problems/:idOrSlug`, and an explicit visibility/status transition operation. List/detail are public only according to visibility/status policy; create/update/transition require an authenticated user and the public authorization policy.

## 10. Web API-Client Boundary

Web imports only public contracts and a typed API client. It MUST NOT import `apps/api` internals, database packages, repositories, or server framework types. The client sends cookies with same-origin requests, maps API errors, and exposes loading/error/empty states without inventing alternate wire shapes.

## 11. Error Contract

Every non-success response is `{ code: string, message: string, requestId: string, details?: unknown }`. Messages are safe for clients; credentials, hashes, tokens, stack traces, and sensitive existence checks are excluded. Validation uses stable `VALIDATION_ERROR`; authentication/authorization use `UNAUTHENTICATED` and `FORBIDDEN`; duplicate identity uses `DUPLICATE_IDENTITY`; missing resources use `NOT_FOUND`.

## 12. Pagination Contract

Collection responses are `{ items, page: { limit, offset, total } }`. `limit` is bounded by the API (default 20, maximum 100); `offset` is zero-based. Ordering is deterministic and documented per endpoint. Invalid pagination is `VALIDATION_ERROR`.

## 13. Authorization Policy Abstraction

Modules call `AuthorizationPolicy.can(action, resource, context)` (or an equivalent public contract) and receive an allow/deny result. Problem authoring depends only on this abstraction and `AuthContext`; it does not import Auth internals. Detailed RBAC/roles are deferred to a later phase.

## 14. Module Registration Contract

Each API module exports a registration function receiving the public application/module context and registering routes, schemas, services, and lifecycle hooks. Central API composition owns registration order, shared error handling, and route prefixing. Module internals remain private.

## 15. Migration Ownership Policy

The existing runner is a simple ordered SQL runner with no central registry. Bootstrap reserves `0001_auth_foundation.sql` and `.down.sql` exclusively for Worker A, and `0002_problem_foundation.sql` and `.down.sql` exclusively for Worker B. Workers MUST NOT edit `0000_platform_metadata*`, `scripts/migrate.mjs`, or a shared registry. Lead owns runner/registry changes and final ordering. Each worker migration is additive, independently named, and must not reference another worker's internal tables without a public contract and Lead integration.
