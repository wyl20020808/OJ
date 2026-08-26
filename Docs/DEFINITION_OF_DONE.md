# Definition of Done

This document defines evidence-based completion for OJPlatform. It supplements [AGENTS.md](../AGENTS.md) and does not make unverified production claims.

## Completion Terms

```text
Code written           = Files or configuration were changed.
Implementation complete = The agreed behavior and scope are implemented.
Tested                 = Relevant automated or manual checks were run and passed.
Runtime verified       = The intended behavior was exercised in a running, relevant environment.
Production qualified   = Runtime verification plus the security, operational, and release evidence appropriate to production.
```

These terms are not synonyms. Code existing does not prove implementation; implementation does not prove testing; testing does not prove runtime or production qualification.

## Default Completion Checklist

For every change, evaluate the applicable items and record unavailable validation accurately:

- Scope and acceptance criteria are satisfied.
- No architecture or security conflict remains.
- Relevant unit and integration tests run.
- Architecture or dependency checks run when available and relevant.
- Lint, typecheck, and build run when the corresponding toolchain exists and applies.
- E2E or runtime checks run when behavior needs a running system.
- High-risk work receives relevant security checks.
- Regression coverage exists where a defect was fixed.
- Materially affected documentation is updated.
- No known blocker remains; the diff is reviewed; no secrets are present; final Git status is understood.

An unavailable check is `NOT VERIFIED` or `BLOCKED`, not silently treated as passing.

## Status Rules

### PASS

All core acceptance criteria have evidence, applicable validation passes, no known blocker remains, and architecture, security, and data-integrity rules are respected.

### PARTIAL

Meaningful work is complete, but required validation, a scope item, or a blocker remains unresolved.

### FAIL

The core goal is not achieved, critical validation fails, or architecture, security, or data integrity is violated.

### BLOCKED

Safe progress cannot continue because a prerequisite is missing, an architecture decision is unresolved, a required environment is unavailable, or protected unknown user work prevents the change.

## Risk-Based Validation Depth

| Change type | Expected validation depth |
| --- | --- |
| Docs-only, low risk | Link/content review, diff review, and repository-safety checks. |
| Ordinary feature | Focused unit tests plus applicable type/lint/build and integration checks. |
| Database or migration | Migration validation, transactional/invariant tests, rollback/compatibility consideration, and integration checks. |
| Authentication or authorization | Unit and integration coverage for allowed and denied paths, security review, and runtime validation where possible. |
| Plugin SDK or public contract | Compatibility analysis, contract tests, versioning/ADR review as applicable, and integration validation. |
| Judge, Sandbox, or security-critical | Boundary and adversarial security testing, integration/runtime qualification, retry/resource-limit coverage, and dedicated review. |
| Production or deployment | Build/release validation, configuration and secret review, operational checks, rollback consideration, and production-appropriate approval. |

The matrix sets a minimum expectation. A task may need deeper validation when its risk warrants it; a low-risk documentation change does not require fictitious E2E or security tests.
