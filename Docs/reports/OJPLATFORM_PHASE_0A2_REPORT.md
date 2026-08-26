# OJPlatform PHASE 0A.2 Report

## Goal / Scope

Upgrade the root `AGENTS.md` into the Codex development constitution, with only a minimal README discoverability update.

## Status

PASS.

## Completed

- Defined source-of-truth priority, architecture/security hard rules, scope and existing-work protection, coding/dependency/license discipline, testing/evidence and status policy, conflict protocols, Git workflow, scoped AGENTS policy, high-risk areas, and no-fake-completion rules.
- Added the required README instruction to read `AGENTS.md`.

## Important Files

`AGENTS.md` and `README.md`.

## Validation

Static coverage checks confirmed all required constitution topics. Diff checks passed; no business source, dependencies, or credential-like values were introduced.

## Architecture / Security Impact

The constitution reinforces Architecture Baseline V1 and does not modify it. It explicitly preserves untrusted-code isolation, Judge database separation, Plugin/Core direction, migration discipline, and secret safety.

## Known Limitations

Detailed development standards, threat model, and definition-of-done documents were deferred to later phases.

## Git / Commit

Commit: `0fdc78444b7206451bee8102ef30549e836fbd6f` (`docs: establish root agent development constitution`).

## Follow-ups

Establish development standards and evidence-based completion governance.
