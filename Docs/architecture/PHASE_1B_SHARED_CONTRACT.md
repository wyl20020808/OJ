# PHASE 1B Shared Contract

Goal: `OJPLATFORM-1B-PARALLEL-BOOTSTRAP`
Status: Bootstrap contract, frozen by the Phase 1B Bootstrap commit.

Workers must treat this file as read-only. Required changes are Integration Requests for Lead review.

## Account Lifecycle

Accounts have lifecycle status `active|disabled|deactivated`. Disabled/deactivated accounts cannot authenticate; existing sessions are rejected or revoked. Identity fields remain owned by Auth/User. Account lifecycle transitions are privileged operations and emit the audit hook described below.

## Role and Permission Model

The public authorization vocabulary is action/resource based. A role grants named permissions such as `problem:create`, `problem:update`, `problem:publish`, and `account:disable`. Role assignment and privileged administration are deferred to this phase's implementation workers; no module may assume a concrete RBAC repository.

## Public Authorization Decision Interface

Modules consume `AuthorizationPolicy.can(action, resource, context, target?) -> Promise<boolean>`. `context` is the authenticated principal (`userId`, `sessionId`, `strength`); `target` is an optional public resource reference. The policy is the only authoring authorization dependency. Denials map to `FORBIDDEN` without exposing policy internals.

## Privileged Audit Hook/Event

Privileged mutations call a public `AuditHook.record({ actorUserId, action, resource, resourceId?, outcome, requestId, occurredAt })`. Audit payloads contain no passwords, hashes, raw sessions, or secrets. Delivery may be synchronous in the modular monolith and must be observable; durable event/audit storage details remain implementation-owned.

## Session-Management Public Shape

Auth exposes only a session-management service shape: `listForUser(userId)`, `revoke(sessionId, actor)`, and `revokeAllForUser(userId, actor)`, returning metadata (`id`, `createdAt`, `expiresAt`, `revokedAt`, `lastSeenAt?`, `deviceLabel?`) and never raw tokens or hashes. Cookie/session semantics remain those frozen in the Phase 1A contract.

## Problem Author Ownership

Every authored problem has an immutable `authorId` public reference. Author checks use `AuthorizationPolicy` and the authenticated context; Problem Authoring must not import Auth internals. Ownership transfer is out of scope unless explicitly added by a later contract.

## Problem Revision and Version Representation

Mutable authoring creates revisions. A `ProblemRevision` has stable `id`, `problemId`, monotonically increasing `revisionNumber`, immutable snapshot fields, `createdBy`, and `createdAt`. A problem points to its current revision; published revisions remain immutable. Submissions and future consumers reference exact problem/revision versions.

## Draft/Published/Archived Semantics

`draft` is author-visible and not public; `published` is publicly readable when visibility permits; `archived` is retained but not listed and is read-restricted. Publishing selects an immutable revision. Updates to a published problem create a new draft revision; they do not mutate the published snapshot. Transitions are explicit, authorized, and audited.

## Authoring Authorization Boundary

Create, edit, revision creation, publish, archive, and visibility changes require an authenticated context and the public authorization decision interface. Auth establishes identity; it does not decide Problem permissions. Detailed roles/administration remain worker scope and later governance.

## Web API and Error Contract

Web uses only typed public HTTP contracts through its API client. It must not import API internals. Success and error shapes remain compatible with Phase 1A: errors are `{ code, message, requestId, details? }`; authorization errors are `UNAUTHENTICATED` or `FORBIDDEN`; validation is `VALIDATION_ERROR`; no credentials, hashes, raw sessions, or stack traces are exposed.

## Migration Ownership

Existing migrations end at `0002_problem_foundation`. Phase 1B reserves `0003_authz_foundation.sql`/`.down.sql` for Auth/Authz Worker and `0004_problem_authoring_revision.sql`/`.down.sql` for Problem Authoring Worker. Workers must not edit prior migrations, the migration runner, or a shared registry. Lead owns ordering and runner integration.
