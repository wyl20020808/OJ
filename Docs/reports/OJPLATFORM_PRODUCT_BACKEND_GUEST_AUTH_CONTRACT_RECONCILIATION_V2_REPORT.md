# OJPlatform Product Backend Guest Auth Contract Reconciliation V2

## Result

Status: PARTIAL WITH INTEGRATION REQUESTS. Guest Auth is implemented at the owned module boundary and is verified with focused memory tests plus real PostgreSQL/Redis integration. Central API composition, migration registry registration, and several Web domains remain Lead/upstream work. No fake identity, score, verdict, total, activity, or wrong-book result is claimed.

- Branch: `codex/product-backend-guest-auth-contract-reconciliation-v2`
- Starting HEAD: `8d85fa11f53a8f5b792cc18774b67e8188e4d8df`
- Final HEAD: reported in the final delivery response after this report commit (the commit hash is self-referential if embedded in its own report).
- Previous included foundation: Contest/Messaging V1 commit `8d85fa11f53a8f5b792cc18774b67e8188e4d8df`

## Guest Auth Implementation

Guest creation uses the existing `users` and `auth_sessions` authorities and adds `guest_identities` plus `guest_resume_credentials` in migration `0010`. Guest users have `email=NULL`, a stable generated username/display name, and a future upgrade path through verified identifiers. Resume credentials are random 32-byte opaque values; only SHA-256 hashes are persisted. The `oj_guest_resume` cookie is HttpOnly, SameSite=Lax, Path=/, bounded by Max-Age, and Secure in production. Successful resume revokes the old hash and inserts a rotated credential. Normal logout revokes only `oj_session`; explicit `DELETE /api/auth/guest/resume` revokes the resume credential.

Guest context strength is `guest`, so existing password-strength authorization does not silently treat a Guest as a fully verified account. Rate limiting is a Redis atomic `INCR`/`EXPIRE` fixed window and fails closed with `429 RATE_LIMITED`. IP is used only for abuse limiting, never identity binding. No fingerprint, MAC, machine ID, User-Agent hash, localStorage bearer token, plaintext token, or token logging is used.

## GUEST-01..40 Evidence

| IDs | Result | Evidence / limitation |
|---|---|---|
| GUEST-01..08 | IMPLEMENTED / TESTED | Real user, guest identity, authoritative session, HttpOnly opaque cookie, nullable email, safe projection, no fake identity, no plaintext hash. `tests/guest-auth.test.ts`; migration `0010`. |
| GUEST-09..16 | IMPLEMENTED / TESTED | Persistent cookie resume returns same user ID, rotates token, rejects replay/expired/revoked token, normal logout preserves resume, explicit revoke invalidates it. Memory and PG/Redis integration tests. |
| GUEST-17..24 | IMPLEMENTED / TESTED | Guest context strength, session ownership, fail-closed limiter, bounded TTL, audit events, no identity binding to IP/browser metadata. |
| GUEST-25..32 | IMPLEMENTED / RUNTIME VERIFIED | PostgreSQL transaction path, API instance restart, cookie-jar simulation, token hash indexes, cleanup of created fixtures. Central composed runtime is not yet reachable. |
| GUEST-33..40 | PARTIAL / LEAD INTEGRATION REQUIRED | Migration runner registration, central dependency injection, Web nullable-email adapter, upgrade flow with verification provider, and production service composition remain outside worker ownership. |

## BCR-01..50 Reconciliation

The complete route-by-route checklist is in [`Docs/parallel/WEB_BACKEND_API_SUPPORT_MATRIX_V2.md`](../parallel/WEB_BACKEND_API_SUPPORT_MATRIX_V2.md). Summary:

| IDs | Result |
|---|---|
| BCR-01..08 Auth/Guest | Guest backend supported; Web nullable-email shape and central composition remain integration items. |
| BCR-09..14 Home/Problems/Detail/Pagination | Backend supported; Problem page exposes real `total`, not Web's optional `totalItems/totalPages` aliases. |
| BCR-15..23 Contest/Registration/Problems/Submissions | Contest foundation supported standalone; composition and richer Web DTO mapping remain required. |
| BCR-24..26 Standings | BLOCKED_BY_UPSTREAM; honest `SCORING_ENGINE_NOT_INTEGRATED`, no fake ranking/score. |
| BCR-27..34 Profile/Activity/Favorites/Teams | Profile account projection exists; Activity, Heatmap, Favorites, and Teams are missing future domains. |
| BCR-35..43 Friends/Requests/Search/Messaging | Backend foundation exists and is real-PG tested; central composition and optional Web shape fields require integration. |
| BCR-44..46 Notifications/Unread | Durable backend exists; category enum adapter and composed runtime remain. |
| BCR-47..50 Homework/Wrong-book/Operations | Homework missing; Wrong-book blocked on authoritative verdict; operations routes require Lead composition. |

## Database and Migration Audit

Migration inventory is `0000`-`0005`, `0007`-`0009`, and worker-owned `0010_guest_auth`. Auth V2 `0006` is reserved but absent in this worktree. `scripts/migrate.mjs` is Lead-owned and still registers only through `0005`; the exact registry request is in `Docs/parallel/PRODUCT_BACKEND_V2_INTEGRATION_REQUESTS.md`. The worker did not modify that script or central `app.ts`.

`0010_guest_auth.sql` creates the two Guest tables, token-hash/expiry/revocation/rotation indexes and constraints, and makes `users.email` nullable. The down migration drops Guest tables and restores the original non-null constraint; lifecycle testing must use a clean controlled database with no remaining Guest rows.

## Runtime Evidence

- Focused memory Auth/Guest tests: 6/6 PASS.
- Real PostgreSQL/Redis integration (`pnpm integration`): 5/5 PASS, including first-use, persistent cookie resume, API instance restart, rotation replay rejection, explicit revoke, and database state inspection.
- Existing Contest/Messaging real PostgreSQL/Redis evidence is carried forward from V1; route composition remains unverified on this worker branch.
- Central `buildApp({ withInfrastructure: true })` does not inject Guest store/limiter, so composed Guest routes currently report unavailable. This is intentionally recorded as `RUNTIME_NOT_COMPOSED / LEAD_INTEGRATION_REQUIRED`, not as a unit-test PASS.

## Security and Scope

Preserved boundaries: user submissions remain untrusted; no Judge/Sandbox/runc/Queue/Phase 2C/Web UI changes; no host or database secret added; Guest has no privileged role; no broad filesystem access is introduced. The recommended production deployment is a dedicated service identity with normal Authz and session boundaries, but service migration is not part of this Goal.

## Quality Gates

Executed successfully after the final implementation amend:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` - 25 files, 339 passed tests, 4 existing skips
- `pnpm test:architecture`
- `pnpm build`
- `pnpm integration` - 2 files, 5 passed real PostgreSQL/Redis tests
- `git diff --check`
- isolated PostgreSQL migration `0000`-`0005`, `0007`-`0010` up/down/up lifecycle

## Integration Requests

See [`Docs/parallel/PRODUCT_BACKEND_V2_INTEGRATION_REQUESTS.md`](../parallel/PRODUCT_BACKEND_V2_INTEGRATION_REQUESTS.md) for migration registry, central composition, Guest Web shape, pagination, scoring, messaging, and future-domain requests.

## Final Classification

```text
Guest Auth module: IMPLEMENTED / TESTED / RUNTIME VERIFIED (standalone)
Composed API Guest Auth: NOT VERIFIED / LEAD_INTEGRATION_REQUIRED
Web contract reconciliation: DOCUMENTED; several shape/domain gaps remain
Overall Goal: PARTIAL WITH INTEGRATION REQUESTS
READY FOR FRONTEND RUNTIME CONTRACT QUALIFICATION = NO
READY FOR PHASE 2B LEAD INTEGRATION = NO
```
