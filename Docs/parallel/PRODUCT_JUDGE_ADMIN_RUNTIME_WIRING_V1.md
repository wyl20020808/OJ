# Product Judge Admin Runtime Wiring V1

## Boundary

Browser requests use only `/api/admin/judge/*`. The Product API owns session authentication, RBAC, CSRF and audit persistence. `JudgeAdminAdapterClient` is server-side and sends `x-judge-service-token` only to the external frozen 2C.8A Judge Service `/v1/admin/*` routes.

## Evidence

- `pnpm infra:up`, `pnpm infra:wait`, and `pnpm db:migrate` completed with PostgreSQL, Redis and MinIO healthy; migration `0012_product_judge_admin_audit` applied.
- Product API and Vite Web started on `127.0.0.1:3000` and `localhost:5173`.
- Browser `/admin/judge/nodes` reached Product UI and rendered the safe unavailable state when Judge was not configured.
- Responsive checks passed at desktop `1440x900`, tablet `1024x768`, and mobile `390x844`; document width equaled viewport width and browser console had no error/warn entries.
- Direct unauthenticated Product request returned `401 UNAUTHENTICATED` with request ID.
- During subsequent integration execution Windows localhost forwarding disappeared: `/ready` returned `not_ready` for postgres, redis and storage; `pnpm integration` failed with `ECONNREFUSED 127.0.0.1:55432`.

## Qualification boundary

The initial infrastructure/migration evidence is runtime evidence, but the unstable forwarding prevented a complete authenticated Web -> Product Backend scenario and prevented real Product -> Judge Service qualification. No mock/stub result is reported as real Judge runtime PASS. Worker/Supervisor multi-node qualification remains 2C.8E.
