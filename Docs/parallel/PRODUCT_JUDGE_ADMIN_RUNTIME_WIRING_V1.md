# Product Judge Admin Runtime Wiring V1

## Boundary

Browser requests use only `/api/admin/judge/*`. The Product API owns session authentication, RBAC, CSRF and audit persistence. `JudgeAdminAdapterClient` is server-side and sends `x-judge-service-token` only to the external frozen 2C.8A Judge Service `/v1/admin/*` routes.

## Evidence

- `pnpm infra:up`, `pnpm infra:wait`, and `pnpm db:migrate` completed with PostgreSQL, Redis and MinIO healthy; migration `0012_product_judge_admin_audit` applied.
- Product API and Vite Web started on `127.0.0.1:3000` and `localhost:5173`.
- Browser `/admin/judge/nodes` reached Product UI and rendered the safe unavailable state when Judge was not configured.
- Responsive checks passed at desktop `1440x900`, tablet `1024x768`, and mobile `390x844`; document width equaled viewport width and browser console had no error/warn entries.
- Direct unauthenticated Product request returned `401 UNAUTHENTICATED` with request ID.
- A bounded recovery used the documented Ubuntu WSL `sleep infinity` keepalive. With forwarding stable, `pnpm test` completed 705 passed/5 skipped and `pnpm integration` completed 9/9.
- Real browser E2E `tests/e2e/judge-admin-product-integration.spec.ts` passed operator login, Product 502 unavailable semantics, CSRF issuance, anonymous 401, Product-only requests, and 1440x900/1024x768/390x844 overflow checks.
- Real browser E2E `tests/e2e/judge-admin-judge-service-integration.spec.ts` passed Product -> frozen Judge 2C.8A summary/list/metrics and 404 node mapping against an empty real registry; browser made no Judge direct request.

## Qualification boundary

The authenticated Web -> Product Backend and Product -> frozen Judge Service read boundaries are runtime-qualified. The real registry was empty, so no control-action success or Worker/Supervisor multi-node qualification is claimed; those remain 2C.8E scope.
