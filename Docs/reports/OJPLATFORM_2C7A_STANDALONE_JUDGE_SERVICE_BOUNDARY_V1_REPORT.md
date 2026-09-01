# OJPlatform Phase 2C.7A Standalone Judge Service Boundary V1

## Result

**PHASE 2C.7A: PASS**

The single-node Judge control plane is an independently launched service with a
separate Judge database role and versioned, authenticated API. Product API is
not required for Judge execution and does not grant its PostgreSQL authority to
the service.

## Boundary

- Branch start: `24e52fd0254ae082da347f892c3e496bcc410cca`
- Entrypoint: `apps/judge-service/src/server.ts`
- Judge persistence: `JUDGE_DATABASE_URL`, independent migration
  `packages/judge-runtime/migrations/0000_judge_service_boundary.sql`
- Product adapter: `JudgeServiceClient` and `productPublication`; only the
  Product repository writes `submission_evaluations`.
- Runtime package: shared `@ojplatform/judge-runtime`; API local files are
  compatibility re-exports, not a second queue implementation.

The local qualification role `oj_judge_service` successfully read its Judge
tables and `SELECT` from Product `submissions` returned `permission denied`.
It and its temporary `ojplatform_judge` database were removed after evidence.

## Contract And Semantics

`/health`, `/ready`, and authenticated `/v1/capabilities` were exercised. The
service supports submit, read, history, cancel, and rejudge; response
projections omit source, expected output, stdout/stderr, leases, Worker data,
score, rank, penalty, and contest fields. Request digests use canonical JSON,
so reordered equivalent duplicate requests are idempotent.

History spans immutable evaluation generations. Cancellation and infrastructure
failure are verdict-free. The shared validator accepts the Go Worker’s cleared
execution identity for non-completed terminal failures while preserving strict
identity validation for completed raw results.

## Runtime Evidence

The independently started Fastify service ran at `127.0.0.1:3107`; Product API
was not started. A non-root `oj-sandbox` Supervisor and Worker used dedicated
Redis prefix `oj:judge:phase2c7a-real`, the frozen C++20 rootfs, and real
HTTP service submission. Results were:

```json
{"AC":"PASS","DUPLICATE":"PASS","WA":"PASS","CE":"PASS","RE":"PASS","TLE":"PASS","MLE":"PASS","CANCEL":"PASS","REJUDGE_HISTORY":"PASS"}
{"INFRA":"PASS"}
```

Service restart retained a persisted queued job. The final runtime cleanup
stopped the Goal-owned units, removed 36 dedicated Redis keys, removed all
Goal-owned binaries/runtime roots, and dropped the temporary Judge DB/role.
No Goal-owned runc container remained.

## JSVC-01..100

| Rows | Result | Evidence |
| --- | --- | --- |
| 01..20 | PASS | standalone entrypoint/config, migration, health/ready/capabilities |
| 21..48 | PASS | contract tests, idempotency, opaque reference, read/cancel/rejudge/history |
| 49..70 | PASS | Product adapter boundary, database denial proof, sanitization, real Worker without Product API |
| 71..83 | PASS | real AC/WA/CE/RE/TLE/MLE/cancel/infra/duplicate/restart and residue cleanup |
| 84..95 | PASS | TypeScript, Go, architecture, integration, format, lint, typecheck, build and diff gates |
| 96..100 | PASS | skip audit, deployment/API docs, scoped commit, clean tracked worktree |

## Limits

**STANDALONE DEPLOYABLE = YES**
**PRODUCT DB DIRECT ACCESS = NO**
**SINGLE-NODE JUDGE RUNTIME = QUALIFIED**
**MULTI_NODE_DYNAMIC_MANAGEMENT = NOT_YET_QUALIFIED**
**READY FOR PHASE 2C.7B = YES**

This does not claim production HA, dynamic worker scheduling, autoscaling,
contest scoring, multi-language, special/interactive judging, or Lead
Integration.
