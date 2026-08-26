# 0001 — Modular Monolith First

Status: ACCEPTED
Date: 2026-08-26

## Context

OJPlatform needs clear module boundaries without premature operational complexity.

## Decision

Start the API as a Modular Monolith and defer service decomposition until justified by real requirements.

## Alternatives Considered

Immediate microservices were rejected as unnecessary at this stage.

## Consequences

Modules share one API deployment but retain explicit public contracts and ownership boundaries.

## Compatibility / Migration Impact

Future decomposition must preserve public contracts and be reviewed as an architecture change.

## Security Impact

This decision does not merge the independent Judge/Sandbox security boundary into the API.

## References

[Architecture Baseline V1](../OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
