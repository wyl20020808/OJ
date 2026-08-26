# 0002 — PostgreSQL as Primary Application Database

Status: ACCEPTED  
Date: 2026-08-26

## Context

Structured application state needs durable transactional storage.

## Decision

Use PostgreSQL as the primary application database; use migrations and preserve migration history.

## Alternatives Considered

Custom distributed databases and premature polyglot persistence were rejected without a demonstrated need.

## Consequences

Application modules own their data contracts and use transactions/constraints for important invariants.

## Compatibility / Migration Impact

Schema changes require formal migrations; published migration history is not casually rewritten.

## Security Impact

Judge Workers remain prohibited from directly accessing Application PostgreSQL.

## References

[Architecture Baseline V1](../OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
