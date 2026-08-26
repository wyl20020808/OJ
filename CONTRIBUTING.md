# Contributing to OJPlatform

OJPlatform is in its governance and engineering-foundation stage. Do not invent commands for services that do not yet exist.

## Before Making Changes

Read [AGENTS.md](AGENTS.md), the [Architecture Baseline](Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md), [Development Standards](Docs/DEVELOPMENT_STANDARDS.md), [Definition of Done](Docs/DEFINITION_OF_DONE.md), and any relevant scoped `AGENTS.md`, Goal, or ADR.

## Workflow

1. Inspect `git status` and read the current Goal.
2. Understand its Scope and Non-goals.
3. Make the smallest compliant change.
4. Run relevant validation.
5. Review the diff.
6. Report evidence accurately.

## Repository Principles

The project uses a modular monolith before any justified decomposition. Judge execution is independent; a Judge Worker never directly accesses Application PostgreSQL. Plugins use the public Plugin SDK boundary. Do not introduce premature microservices or copy Hydro source code.

## Commits and Dependencies

Keep commits scoped. Do not include secrets, unrelated cleanup, or generated junk; do not force-rewrite shared history or change a user's global Git configuration to make a commit work.

New dependencies need a clear need, license and security consideration, and confirmation that they do not duplicate an existing solution. Architecture-significant changes require an ADR.

## Testing

Follow [Definition of Done](Docs/DEFINITION_OF_DONE.md). Validation depth is risk-based, and reports must distinguish implementation from testing and runtime qualification.
