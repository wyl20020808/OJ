# OJPlatform Development Constitution

This file defines the highest daily development rules for every Codex Agent working in this repository. It is not a copy of the Architecture Baseline, a complete coding standard, threat model, contribution guide, module design, or security specification. Detailed rules belong in the linked documents.

## Project Identity

```text
Project = OJPlatform
Project Root = D:\OJPlatform
Project Type = Online Judge Platform
Development Model = Goal / Phase Driven
```

OJPlatform is a long-lived, maintainable Online Judge platform, not a one-off demo.

## Frontend Architecture

All web frontend changes must follow:

`apps/web/AGENTS.md`

Frontend code must prioritize:

- feature ownership
- component isolation
- API correctness
- maintainability
- parallel development safety

Do not accumulate page-specific code in global application files.

## Source of Truth and Conflicts

Resolve ordinary guidance in this order:

```text
1. User's current explicit instruction
2. Root AGENTS.md
3. Nearest scoped AGENTS.md
4. Architecture Baseline
5. Approved ADR
6. Phase Goal / Task Contract
7. Development Standards
8. Module Design Documents
9. Existing implementation
```

User instructions do not authorize silently breaking safety, architecture, data integrity, or user-file protection. Report `ARCHITECTURE CONFLICT` or `SECURITY CONFLICT`, identify the rule, propose the smallest alternative, and wait for an approved ADR when a baseline change is required.

Primary references:

- [Architecture Baseline](Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- Future references: `Docs/DEVELOPMENT_STANDARDS.md`, `Docs/DEFINITION_OF_DONE.md`, `Docs/architecture/DEPENDENCY_RULES.md`, `Docs/security/THREAT_MODEL.md`, and `Docs/adr/` (later phases; not yet complete).
- Medium/large Goals MUST leave `Docs/reports/<GOAL_ID>_REPORT.md` and update `Docs/PROJECT_STATUS.md`; normally commit both with the Goal.
- High-risk work MUST read the relevant `Docs/security/` requirements, threat model, trust boundaries, and review checklist before implementation.

## Architecture Hard Rules

These are MUST/MUST NOT rules:

- User submissions are `UNTRUSTED CODE`; they MUST NOT execute in API, Web, Core, or Plugin Host processes.
- Judge Workers MUST NOT directly access Application PostgreSQL. Use the Judge Protocol and Judge Coordinator boundary.
- Core MUST NOT depend on a concrete Plugin. Plugins MUST NOT import Core internals and may depend only on the public Plugin SDK/contracts.
- Modules MUST NOT access another module's internal repositories, database internals, or internal files; MUST NOT form circular dependencies. Use explicit Public Service, Contract, Event, Command, or Query interfaces.
- The API SHOULD be stateless; durable business state MUST NOT depend on one API node's memory.
- Problem and testdata used by formal Submissions MUST be immutable or versioned and traceable.
- Judge Jobs and Results MUST tolerate retry and duplicate delivery without corrupting state.
- Secrets (API keys, passwords, tokens, private keys, database credentials, production secrets) MUST NOT enter source control. Tests use environment variables, fixtures, or mocks.
- An unqualified custom sandbox MUST NOT be called `secure`, `safe`, or `production ready`.

## Scope and Existing Work

Implement only the current Goal/Phase. Do not opportunistically develop future features, refactor unrelated modules, replace the stack, upgrade broad dependencies, or redesign the project. Record nearby concerns as `FOLLOW-UP`, `TECH DEBT`, or `RISK`.

Protect existing work: never delete unknown files, overwrite unexplained changes, reset uncommitted user work, force-checkout, `git reset --hard`, or `git clean -fd`. Do not delete tests or change unrelated files to manufacture a PASS.

## Coding Behavior

- Prefer the smallest clear, readable implementation that satisfies the approved architecture and goal.
- Keep responsibilities and public APIs explicit; avoid giant files, god classes, repetition, speculative abstractions, and implicit internal APIs.
- Do not silently swallow errors or use a temporary hack as a formal implementation.
- TODOs MUST state the reason and follow-up. Empty placeholders, fake integrations, and meaningless scaffolding MUST NOT be reported as complete.

Detailed TypeScript/Go standards belong to PHASE 0A.3, not this constitution.

## Dependency and License Discipline

Before adding a dependency, assess whether it is necessary, whether existing capability suffices, maintenance, license, security, and long-term cost. Do not add large packages for tiny tasks, unknown-source packages, duplicate libraries, or unapproved core technology changes. Core dependency changes require an ADR.

Hydro and other OJ projects may be architecture, product, or behavioral references. Their license-bound source MUST NOT be copied into OJPlatform. Third-party libraries retain their license and notices.

## Testing and Evidence

Implementation complete is not Task PASS. Run checks appropriate to the change, including relevant unit, integration, architecture, type, lint, build, E2E, runtime, security, or regression tests. Never delete/skip tests, weaken assertions, replace real tests with meaningless mocks, hardcode results, or bypass a real bug. If an environment prevents testing, report `TEST BLOCKED`.

Reports MUST distinguish `IMPLEMENTED`, `TESTED`, `RUNTIME VERIFIED`, `NOT VERIFIED`, and `BLOCKED`. Never claim tested, verified, working, secure, or production ready without executed evidence. Runtime PASS requires runtime evidence; sandbox security claims require dedicated security qualification.

## Completion Status

- `PASS`: all current acceptance criteria are implemented and evidenced, relevant tests pass, no known blocker exists, and the baseline is respected.
- `PARTIAL`: any key test/evidence is missing, a blocker remains, scope is incomplete, or an architecture issue is unresolved.
- `FAIL`: the core goal is missing, a key test fails, a security boundary is breached, architecture is seriously violated, data may be damaged, or feasibility is disproved.

Never lower a status to make a report look better.

## Architecture and Security Conflict Protocol

For an architecture conflict: explain it, locate the Baseline clause, propose the minimum viable alternative, and recommend an ADR plus Architecture Review. Do not silently change the Baseline or bypass it. Until approved, use `BLOCKED_BY_ARCHITECTURE_DECISION` where applicable.

For a security conflict (for example direct production-DB access by a Judge, disabled sandbox isolation, source-controlled tokens, or user code in API), report `SECURITY CONFLICT` and do not execute the unsafe request.

## Database and Public Contracts

Future schema changes MUST use formal migrations. Never hand-edit production schema or rewrite a migration already in formal history to conceal a problem. Compatibility-sensitive contracts include the Plugin SDK, Judge Protocol, Public API, migration history, serialized events, and external CLI contracts. Breaking changes require explicit Compatibility Impact and the applicable ADR/versioning process.

When implementation changes architecture, public API, Plugin SDK, Judge Protocol, deployment, security model, or developer workflow, update the relevant documentation without rewriting unrelated documentation.

## Git Discipline

At task start run `git status`; at task end run `git status` and `git diff`. Before committing, check for secrets, unrelated changes, generated junk, and unknown user work. Keep commits scoped. Do not force-push, rewrite shared history, or modify global Git configuration. Do not assume every task needs a commit; commit only when the Phase Goal asks for it, using `<type>: <clear scoped description>`.

## Goal / Phase Workflow

```text
GOAL -> PHASE -> READ -> PLAN -> IMPLEMENT -> TEST -> REVIEW
      -> RUNTIME VALIDATION -> REPORT -> PASS / PARTIAL / FAIL
```

Before a new Phase, read this file, the nearest scoped `AGENTS.md`, the Architecture Baseline, and the current Goal; check Git status; understand Scope and Non-goals; then write.

Complete local Runtime startup, shutdown, and status MUST use `scripts/dev-runtime.ps1`
or its `OJPlatform-*.bat` entry points. Unless the Runtime Manager itself is broken,
agents MUST NOT manually orchestrate the full service set.

## Scoped AGENTS.md

Future directories may add module-specific rules, such as `apps/web/AGENTS.md`, `apps/api/AGENTS.md`, `apps/judge-worker/AGENTS.md`, `packages/plugin-sdk/AGENTS.md`, and `tests/security/AGENTS.md`. Scoped files may add framework or security requirements but MUST NOT weaken root hard architecture or safety rules unless a formal architecture decision changes them.

## High-Risk Areas

Treat Judge Worker, Sandbox, Authentication, Authorization, Plugin Runtime, Database Migration, Secrets, Production Deployment, Remote Judge, File Upload, and Object Storage Access as high-risk. Changes require stronger testing and review.

## No Fake Completion or Silent Fallback

Do not present placeholders, fake integrations, mocks, absent runtime checks, or absent sandbox attack tests as real completion or production qualification. Fakes/mocks are allowed only when the Phase explicitly calls for them and reports MUST say `FAKE / MOCK / TEST ONLY`.

High-risk systems MUST NOT silently fall back after a real failure. Any fallback must be explicitly designed, observable, logged, and must not hide correctness or security failures.

Always distinguish:

```text
Code Exists | Feature Implemented | Feature Tested | Feature Runtime Qualified | Production Ready
```

These labels are not interchangeable.

This constitution is intentionally concise. Extend it through later governance phases and ADRs rather than duplicating the Architecture Baseline here.

## Codex Output Style

The user prefers concise technical communication.

When reporting progress or completion:

Prefer:

- direct status
- actionable information
- structured summaries
- clear blockers

Avoid:

- repeating the task description
- repeating known project context
- generic encouragement
- tutorial-style explanations unless requested
- unnecessary background explanations
- duplicate summaries

Default final report format:

```text
STATUS:
PASS / PARTIAL / FAIL

CHANGES:
- concise list of changed files/features

VALIDATION:
- tests/build/typecheck results

BLOCKERS:
- only actual blockers

NEXT:
- next required action
```

## Execution Communication

During long-running tasks, keep progress updates concise.

Focus on:

- current action
- discovered blocker
- decision required

Do not provide repeated explanations of:

- standard Git concepts
- obvious engineering principles
- already established project rules

When a rule is already known from `AGENTS.md`, reference it instead of restating the entire rule.

## Token Efficiency

Prefer efficient investigation and reporting.

Avoid:

- dumping entire large files without need
- repeating unchanged information
- generating duplicate reports
- re-explaining previous verified conclusions
- broad scans when targeted inspection is sufficient

Prefer:

- targeted file inspection
- concise summaries
- references to existing reports
- incremental analysis

For large files, inspect relevant sections first.

For completed work, report the delta, not the entire history.

## Balance Between Conciseness and Completeness

Concise output does not mean incomplete verification.

For complex tasks such as:

- integration
- security review
- database migration
- architecture changes
- runtime changes

still provide:

- actual validation results
- real blockers
- risks
- unverified items

Never remove important qualification information only to shorten output.

## Codex Skill Usage

For large engineering tasks, prefer using the `caveman` skill.

Use `caveman` for:

- repository-wide audits
- architecture analysis
- large refactors
- multi-file feature implementation
- integration work
- complex debugging
- dependency analysis
- migration planning

However:

Project rules always override skill behavior.

The `caveman` skill does NOT override:

- Git safety rules
- Feature Worker rules
- Integration Lead rules
- no fake PASS policy
- manual UI acceptance policy
- API/business correctness requirements

## Caveman Operating Policy

When using caveman, the agent should:

- inspect before modifying
- understand existing architecture
- identify dependencies
- avoid unnecessary scope expansion
- preserve existing behavior
- report uncertainty explicitly
- separate implementation from verification

Before large changes, perform:

- repository state inspection
- dependency analysis
- ownership analysis
- risk analysis

Do not use caveman as permission to:

- rewrite unrelated code
- bypass review
- ignore project constraints
- make destructive Git operations

## Rule Priority

For OJPlatform task execution, priority order is:

1. User explicit request
2. OJPlatform AGENTS.md rules
3. Security and data correctness requirements
4. Git safety rules
5. Feature/Integration workflow
6. Caveman skill behavior
7. General implementation convenience

This execution order complements, and does not replace, the Source of Truth and
Conflicts order above.

Caveman improves execution quality but does not change project authority.

## Workflow Role Boundaries

Feature Workers MUST NOT merge into `main`. Integration Leads MUST start from
the latest live `main` and preserve complete history through the approved
integration workflow.

Protect dirty tracked files, untracked files, stashes, and worktrees. Do not
use `git restore .`, `stash drop`, destructive reset/clean commands, force
merges, or history rewrites.
