# 0004 — Plugin SDK Dependency Direction

Status: ACCEPTED
Date: 2026-08-26

## Context

Plugin extensibility must not couple the core to concrete extensions or permit internal monkey-patching.

## Decision

Core does not depend on concrete plugins. Plugins depend only on the stable public Plugin SDK and explicitly exposed contracts, never Core internals.

## Alternatives Considered

Direct internal imports and monkey-patching were rejected because they make compatibility and security boundaries ungovernable.

## Consequences

Public SDK design and compatibility review are required before exposing extension points.

## Compatibility / Migration Impact

Plugin SDK changes are compatibility-sensitive and require explicit impact analysis, versioning, and ADR review where applicable.

## Security Impact

The rule limits plugin authority to documented contracts and protects Core internals.

## References

[Architecture Baseline V1](../OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
