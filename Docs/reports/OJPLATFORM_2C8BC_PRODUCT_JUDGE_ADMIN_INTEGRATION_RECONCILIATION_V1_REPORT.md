# OJPlatform Phase 2C.8BC Product Judge Admin Integration Reconciliation V1 Report

Final Status: `PARTIAL / PRODUCT_RUNTIME_NOT_STABLE`

## Scope and Git Evidence

- Integration branch: `codex/phase2c8bc-product-judge-admin-integration-reconciliation-v1`
- Product baseline: `4e3f682b101252641086d48e51825e4d8064fa74`
- 2C.8B exact HEAD: `4a6a03baef5a36641feb3d2ff889592cb65ad158`
- 2C.8C exact HEAD: `75e7d2d84900945be12ec93e00fe50e8b0008343`
- Frozen 2C.8A authority: `63ba05eecceb3b09ee15075c38f82522ff1e89cd`
- Historical merges: `3dd002b` (2C.8B), `da92ab1` (2C.8C)
- 2C.8A implementation was not merged or modified.

Both worker branches diverged before the Product baseline merge. Their exact ancestry and changed paths were audited before integration. 2C.8B owns Product API/adapter/RBAC/audit paths; 2C.8C owns Web UI/client paths.

## Implemented

- Reconciled Product `/api/admin/judge/*` routes with frozen Judge `/v1/admin/*` routes.
- Normalized Judge summary `countsByState` into explicit Product count fields.
- Wrapped control responses with `operationId`, `correlationId`, and safe updated `node` projection.
- Preserved bounded pagination, safe sanitization, stable error mapping, authentication/RBAC, CSRF, idempotency and durable audit.
- Registered unavailable Product routes even when no Judge URL/token is configured, yielding safe upstream-unavailable behavior after authorization.
- Added typed Web assignment detail and metrics methods; mutation requests carry the CSRF header when the Product double-submit cookie is available.
- Preserved disabled Start/Stop/Restart with `HOST_AGENT_NOT_AVAILABLE` and Product-only browser boundary.

## Tested

- Focused Judge Admin contract tests: **PASS**, 6 tests.
- `pnpm test:web`: **PASS**, 11 tests.
- `pnpm typecheck`: **PASS**.
- `pnpm lint`: **PASS**.
- `pnpm format:check`: **PASS**.
- `pnpm test:architecture`: **PASS**.
- `pnpm build`: **PASS**.
- `pnpm build:web`: **PASS**.
- `git diff --check`: **PASS**.
- Responsive browser smoke: **PASS** at 1440x900, 1024x768, 390x844; no overflow, no unexpected console/page errors.

## Runtime / Blockers

`pnpm infra:up`, `pnpm infra:wait`, and `pnpm db:migrate` initially passed with PostgreSQL, Redis and MinIO healthy. Product API/Web started and unauthenticated Product Judge Admin returned `401 UNAUTHENTICATED`; the UI rendered the safe unavailable state with no browser console errors.

The Windows localhost forwarding then became unavailable. API `/ready` reported `not_ready` for postgres, redis and storage, and `pnpm integration` failed with `ECONNREFUSED 127.0.0.1:55432`. Therefore authenticated Web -> Product Backend runtime qualification is `BLOCKED/NOT VERIFIED`, and Product -> real Judge Service Admin API is `NOT VERIFIED` because no safely available external 2C.8A service/nodes were present. No stub evidence is promoted to real Judge runtime PASS.

Worker/Supervisor multi-node runtime, Host Agent, HA and autoscaling remain out of scope and deferred to 2C.8E/future goals.

## Security / Architecture

No Judge token or node token enters browser code. Product session remains the normal HttpOnly session model; CSRF token is a separate non-secret double-submit cookie. Product owns authorization and audit. No Judge implementation, Worker, Supervisor or untrusted-code execution path was changed.

## Result

Product contract integration is implemented and contract-qualified. Overall Goal is `PARTIAL` because the required real Product runtime/browser authenticated path was not stable for complete qualification. Production readiness is not claimed.
