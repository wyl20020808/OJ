# 0003 — Independent Judge Worker Boundary

Status: ACCEPTED
Date: 2026-08-26

## Context

User submissions are untrusted and must not share the API/business trust boundary.

## Decision

Judge Workers remain independent from the API and communicate through the Judge Protocol and Judge Coordinator. They do not directly access Application PostgreSQL; user code runs only through an independently qualified Sandbox.

## Alternatives Considered

Running user code in the API or allowing direct database access was rejected as unsafe and architecturally coupled.

## Consequences

The system must define explicit job/result contracts and retry-safe idempotent processing.

## Compatibility / Migration Impact

Judge Protocol changes are compatibility-sensitive and require explicit review.

## Security Impact

This preserves the primary untrusted-code, database, and Sandbox boundaries.

## References

[Architecture Baseline V1](../OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
