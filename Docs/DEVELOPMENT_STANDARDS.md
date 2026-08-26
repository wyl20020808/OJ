# Development Standards

These standards establish practical implementation conventions for OJPlatform. They complement, and never weaken, the root [AGENTS.md](../AGENTS.md) and the [Architecture Baseline](OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md). They describe future development behavior; no runtime, framework, or toolchain is initialized by this document.

## General Engineering

- Prefer clarity over cleverness and the smallest sufficient change.
- Give code, files, types, and modules a single clear responsibility. Avoid giant files, god objects, and speculative abstractions.
- Treat public contracts as deliberate. Internal implementation is not an accidental API.
- Do not silently swallow errors or represent a fake implementation as a production integration.
- Comments explain decisions, constraints, or reasons, not obvious syntax.
- `TODO` and `FIXME` entries include the reason and a useful follow-up context.

## Naming and Files

- Use lower-case, hyphen-separated directory and non-component file names where the local ecosystem permits. Keep module boundaries visible in the directory layout.
- TypeScript types, interfaces, classes, React components, and Go exported identifiers use `PascalCase`; functions, hooks, and variables use `camelCase` in TypeScript and Go's conventional mixedCaps. Constants use names appropriate to their scope; exported constants are descriptive rather than abbreviated.
- React components use `PascalCase` files; hooks are named `useX`. Go package names are short, lower-case, and domain-oriented; package and file names avoid stuttering.
- Tests are named after the unit or behavior under test with a conventional test suffix, for example `submission-service.test.ts` or `submission_service_test.go`.
- Migrations have ordered, descriptive names created by the migration tool. ADRs, Goals, and Reports use their approved identifiers and descriptive titles.

Formatters and linters should enforce mechanical style once the toolchain exists; do not replace them with an expanding manual style guide.

## TypeScript

The future TypeScript baseline is strict mode.

- Avoid `any`; a boundary-only exception must be justified and narrowed immediately.
- Make external input/output contracts explicit. Validate untrusted or external data at the boundary at runtime.
- Use discriminated unions when they make valid states and exhaustive handling clearer.
- Handle asynchronous failures explicitly, await work deliberately, and avoid floating promises.
- Avoid hidden module-level mutable state. Imports must respect module boundaries and public contracts.

## React

- Use functional components and follow the Rules of Hooks.
- Keep server state distinct from local UI state; do not introduce global state without a demonstrated need.
- Send API calls through a defined client or service boundary.
- Provide accessible semantics, keyboard operation where applicable, and predictable loading, error, and empty states.
- Extract a reusable component only when reuse is real; do not select a state-management library preemptively.

## Node.js / Fastify API

- Keep routes thin. Put business rules in services or use-cases and validate at the request boundary.
- Authentication establishes identity; authorization checks permissions. They are not interchangeable.
- Map errors explicitly and do not leak stack traces, secrets, or implementation details to clients.
- Repositories are module internals, not cross-module public APIs.
- Respect request cancellation and lifecycle where relevant, and use structured logs with safe fields.

## Go / Judge Worker

- Keep Go code `gofmt`-formatted. Return and wrap errors with useful context; do not swallow them.
- Use `context.Context` for cancellable or time-bounded work. Every goroutine has an owner and lifecycle; clean up resources and bound concurrency.
- Never use shell-execution shortcuts for untrusted code. User code executes only through the approved Sandbox boundary.
- A Judge Worker must not directly access Application PostgreSQL. It communicates through the Judge Protocol and Judge Coordinator.
- Design Judge work for retry and idempotency, including duplicate result delivery.

## Database

- Make schema changes through formal migrations. Do not rewrite published migration history except through an explicit exceptional process.
- Use transactions around multi-step consistency boundaries.
- Do not scatter raw cross-module table manipulation through application code. Preserve module ownership and public contracts.
- Enforce important invariants with database constraints where appropriate.
- Never commit database credentials or other secrets.

## APIs and Compatibility

Public API, Plugin SDK, Judge Protocol, serialized events, migration history, and external CLI contracts are compatibility-sensitive. Consider compatibility before changing them. State the impact explicitly; architecture-significant or breaking changes require the applicable ADR and versioning decision.

## Testing

- Test observable behavior rather than implementation trivia. Bug fixes should normally include a regression test.
- Prefer deterministic tests. Match validation depth to the change risk.
- Fakes and mocks support focused testing but do not replace required integration or runtime qualification.
- Never weaken, remove, skip, or hardcode tests merely to make a check pass.

## Documentation

Update the relevant documentation when work materially changes architecture, a public contract, the security model, deployment, or developer workflow. Do not create unrelated documentation churn for ordinary internal changes.
