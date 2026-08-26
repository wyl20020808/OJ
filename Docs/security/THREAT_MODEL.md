# OJPlatform Threat Model

Status: SECURITY DESIGN BASELINE (pre-implementation). This document describes requirements and design decisions, not implemented or verified controls.

## Scope

This model covers the intended Online Judge architecture: browser/API, modular-monolith application, PostgreSQL, Redis/queue, object storage, Judge Coordinator/Worker, Sandbox, plugins, administration, imports, and future deployment. Runtime implementation, final Sandbox backend, concrete cryptography, and operational runbooks are deferred.

## Security Objectives

Protect confidentiality, integrity, availability, tenant/user isolation, Judge result integrity, hidden-testdata confidentiality, administrative integrity, auditability, and recovery capability.

## Assets

User credentials and sessions; authorization state; source submissions and private contest submissions; private/hidden testdata; problem statements and assets; Judge jobs/results and scoreboards; database, queue, and object-storage state; plugin packages/configuration; system and deployment secrets; admin actions; logs/audit records; Judge Worker identity; future deployment credentials.

## Actors and Trust

| Actor | Trust level | Notes |
| --- | --- | --- |
| Anonymous Internet User | Untrusted | Can send arbitrary requests. |
| Registered User / Contest Participant | Semi-trusted | Owns permitted data only. |
| Malicious Participant | Untrusted | May submit adversarial code and abuse workflows. |
| Problem Setter | Semi-trusted | Can author problem/testdata within authorization. |
| Trusted Operator / Administrator | Privileged trusted | Actions require least privilege and audit. |
| Plugin Author | Semi-trusted external | Code/package is not automatically Core-trusted. |
| Compromised Plugin | Untrusted | Must be constrained by SDK/capabilities. |
| Judge Worker | Service-trusted, bounded | Authenticated service, not a database owner. |
| Compromised Judge Worker | Untrusted service | Must not yield unrestricted application access. |
| External Identity Provider | External dependency | Trust is limited to verified protocol claims. |
| Storage/Infrastructure Operator | Infrastructure-trusted | Access must be least-privilege and auditable. |
| Supply-chain Attacker | Untrusted | May target packages, images, build inputs, or updates. |

## Entry Points

HTTP API; WebSocket/SSE; login/session endpoints; file upload; problem import; submission source; plugin installation/configuration; admin operations; authenticated Judge Protocol; object storage; queue; future webhooks/integrations; CLI; deployment/configuration.

## Method

STRIDE is applied per entry point and trust boundary. Likelihood is LOW/MEDIUM/HIGH; impact is LOW/MEDIUM/HIGH/CRITICAL; overall risk uses the highest credible combination without fake numerical precision. A statement marked REQUIREMENT or DESIGN DECISION is not an IMPLEMENTED CONTROL; a VERIFIED CONTROL needs executed evidence.

## STRIDE Analysis

### Spoofing

- Session/token theft can impersonate users or administrators; require secure session handling, rotation/revocation, server-side authorization, and audit.
- A fake Judge Worker or result sender could fabricate outcomes; require mutually authenticated service identity and job/attempt binding.
- Plugin identity confusion can load an unapproved package; require package identity, provenance, and explicit installation authorization.

### Tampering

- Submission, Judge Result, scoreboard, queue, or testdata tampering can change correctness or contest outcomes; require integrity-protected protocols, versioned immutable testdata, idempotent state transitions, and audit trails.
- Plugin packages/configuration can be modified in transit or at rest; require integrity verification and controlled publication.

### Repudiation

Missing admin audit, untraceable rejudge, replayed result, or undocumented testdata/version change prevents investigation. Record actor, action, target, version, job/attempt identity, and outcome without logging secrets.

### Information Disclosure

Protect hidden testdata, private source, credentials, cross-user data, stack traces, object-storage objects, and environment data. Authorization must be enforced server-side; errors and logs must not disclose secrets or internal paths.

### Denial of Service

Model API abuse separately from queue starvation, compiler stress, infinite loops, fork/process bombs, memory exhaustion, stdout/stderr and file floods, oversized imports, decompression bombs, and plugin resource exhaustion. Limits must be independent and fail closed.

### Elevation of Privilege

Consider Sandbox escape/container breakout, plugin privilege escalation, IDOR/authorization errors, path traversal, privileged-file access, host socket access, and compromised Worker overreach. Explicit capability boundaries and least privilege are required.

## OJ-Specific Abuse Cases

Future qualification must cover infinite loops; fork bombs/process explosion; memory bombs; huge stdout/stderr; huge file creation; symlink/hardlink tricks; path traversal; filesystem, `/proc`, and `/sys` probing; environment-variable scraping; network scanning; DNS exfiltration; localhost and metadata-service probing; process introspection; ptrace/debug tricks; timing attacks against hidden data; compiler stress; archive bombs; malformed checker/interactor payloads; Judge-result replay; duplicate job/result races; malicious testdata/custom checkers; compromised plugins; and compromised Judge Workers.

## Security Assumptions

- Production Judge/Sandbox work is Linux-oriented.
- API and Judge credentials are distinct and least-privilege.
- Judge Workers cannot access Application PostgreSQL directly.
- Untrusted code has no network by default.
- Production secrets are never committed.
- UI visibility never substitutes for server-side authorization.
- Testdata and Submission provenance are versioned.

## Deferred / Out of Scope

No runtime controls, threat tests, final Sandbox backend, threat-model metrics, incident runbook, or production qualification is established here. These require later implementation and dedicated gates.

## Future Security Gates

`SECURITY DESIGN BASELINE` validates coherent design; `JUDGE PROTOCOL SECURITY QUALIFICATION` validates authenticated job/result integrity; `SANDBOX IMPLEMENTATION QUALIFICATION` validates isolation and attack resistance; `AUTHORIZATION SECURITY QUALIFICATION` validates identity/permission paths; `PLUGIN RUNTIME SECURITY QUALIFICATION` validates plugin containment; `PRODUCTION SECURITY QUALIFICATION` validates operational deployment. Passing an earlier gate does not imply runtime or production security.
