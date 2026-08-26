# OJPlatform Architecture Baseline V1

## Status and Authority

This document is the current highest-level architecture source of truth for OJPlatform. Material architectural changes must follow the evolution process in this document; ordinary feature work must not silently change this baseline.

## Product Goal

OJPlatform is a modern Online Judge designed for long-term evolution, secure execution of user code, horizontal scaling, and a plugin ecosystem.

Priority order:

```text
Correctness
>
Maintainability
>
Security
>
Extensibility
>
Measured Performance
>
Feature Quantity
```

## Core Architecture

The long-term direction is a monorepo with a modular-monolith API, independent Judge Workers, an independent sandbox security boundary, a Plugin SDK, and a stateless API. The initial technology direction is React + TypeScript for the frontend, Node.js + TypeScript + Fastify for the API, PostgreSQL, Redis, S3-compatible object storage such as MinIO, Go Judge Workers, WebSocket/SSE realtime delivery, and Docker Compose first. Kubernetes is deferred until justified.

```text
Web UI
    |
HTTP / WebSocket / SSE
    |
API Server
    |
+--------------------------+
| PostgreSQL               |
| Redis                    |
| Object Storage           |
+--------------------------+
    |
Judge Queue
    |
Judge Worker Pool
    |
Sandbox
    |
Untrusted User Code
```

## Modular Monolith

The API starts as a Modular Monolith. Expected modules are:

```text
Auth
User
Permission
Problem
Submission
Judge Coordinator
Contest
Plugin
Storage
Notification
Admin
Audit
```

Module internals are not implicit public APIs. Cross-module access must use explicit public contracts.

## Judge Trust and Database Boundaries

User code is **UNTRUSTED CODE**. It must never execute in the API Server, Web Server, Database Process, Redis, or Plugin Host. Judge Workers and the API/business system are separate boundaries.

Judge Workers must not directly access the Application PostgreSQL database. The required direction is:

```text
Judge Worker
    |
Judge Protocol
    |
Judge Coordinator
    |
Application Database
```

## Sandbox

The sandbox is an independent security boundary. Its future qualification must consider namespace isolation, cgroups v2, seccomp, filesystem isolation, network isolation, process limits, CPU limits, memory limits, wall-time limits, output limits, and privilege dropping.

A self-built, unqualified simple sandbox must not be represented as production-safe.

## Plugin Architecture

Plugin support is a first-class architecture capability:

```text
Core
X
Plugin
```

Core must not depend on a specific Plugin. Plugins may depend only on the stable Public Plugin SDK and must not monkey-patch Core internals. Possible future extension areas include Authentication, Problem Import, Contest Rules, Scoreboard, Storage, Notification, UI, Judge Extensions, and Remote Judge.

## Stateful Data and Storage

The API should remain stateless. Important state belongs in PostgreSQL, Redis, or Object Storage rather than API-node memory.

- Structured application data: PostgreSQL.
- Cache and transient coordination: Redis.
- Testdata, attachments, images, and large artifacts: S3-compatible Object Storage.

## Problem Versioning and Judge Idempotency

Problems and testdata must be version-aware. Historical Submissions must be traceable to the Problem Version and Testdata Version they used. Published data must not rely on undocumented in-place replacement.

Judge queues are designed for possible **At-Least-Once Delivery**. Judge Jobs must be retry-safe, and duplicate Judge Results must not corrupt application state.

## Security Baseline

The following rules are not to be casually violated:

1. Untrusted code never executes inside the API process.
2. Judge Workers cannot directly access Application PostgreSQL.
3. Core modules cannot depend on Plugins.
4. Plugins depend only on the Public Plugin SDK.
5. Cross-module access uses explicit public contracts.
6. Judge Jobs must be retry-safe and idempotent.
7. The API should remain stateless.
8. Testdata must be immutable or versioned.
9. Privileged operations should generate Audit Logs.
10. Plugins must not monkey-patch Core internals.
11. Secrets must never enter source control.
12. New modules require automated tests.
13. No premature microservices.
14. Security-sensitive sandbox changes require dedicated qualification.

## Anti-Overengineering

Without a demonstrated need, do not introduce:

```text
Microservices
Kafka
Kubernetes
Custom RPC framework
Event Sourcing
CQRS
Custom distributed database
Custom sandbox
Excessive Plugin extension points
```

First establish clear boundaries; add complexity only in response to real needs.

## Architecture Evolution

Material architecture changes follow:

```text
Problem / Requirement
        ↓
ADR
        ↓
Architecture Review
        ↓
Decision
        ↓
Implementation
```

They must not be introduced silently through ordinary feature tasks.
