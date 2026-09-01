# ADR 0005: Standalone Judge Service Boundary

## Status

Accepted for Phase 2C.7A single-node qualification.

## Context

Phase 2C.6 allowed the Product API to coordinate Redis jobs and publish a
validated terminal result to `submission_evaluations`. The next boundary needs
an independently deployable Judge control plane without granting that process
Product PostgreSQL credentials.

## Decision

`apps/judge-service` is a separately launched Fastify process. It owns the
versioned `/v1` Judge contract, service authentication, Redis job coordination,
and durable `judge_service_*` projections in `JUDGE_DATABASE_URL`. Its runtime
depends on the public `@ojplatform/judge-runtime` package, never on API module
internals or Product repositories.

The Product API calls the service through `JudgeServiceClient` when both
`JUDGE_SERVICE_URL` and `JUDGE_SERVICE_TOKEN` are configured. Only the Product
repository translates a sanitized terminal service DTO into its own
`submission_evaluations` projection. The former API-local behavior remains a
compatibility mode while the service is not configured.

Redis remains the transient queue and lease authority. Judge DB retains the
service-owned job/result projection and immutable evaluation-generation history.

## Consequences

The service can start without Web or Product API. A service credential is
required for all `/v1` endpoints; health and readiness are intentionally public.
This decision does not add dynamic node scheduling, workers reading Product DB,
contest scoring, HA, or a multi-node control plane.
