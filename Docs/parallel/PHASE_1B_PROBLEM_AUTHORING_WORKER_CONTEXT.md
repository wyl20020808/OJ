# Phase 1B Problem Authoring Worker Context

Branch: `codex/phase1b-problem-authoring`
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`
Allowed: Problem authoring/revision files and tests under the Problem module, migration `0004_problem_authoring_revision.sql*`, this worker report/context for evidence.
Forbidden: Auth/Authz internals, Web, shared contracts, API composition, migration runner/registry, root manifests, `PROJECT_STATUS.md`, `Goals/`.
Contract: `Docs/architecture/PHASE_1B_SHARED_CONTRACT.md` (read-only).
Acceptance: author ownership, immutable revisions, draft/published/archived semantics, authorization through public policy, audit calls, tests, and permanent report. No submissions or judge behavior.
Integration: expose public module registration and policy/audit dependencies; record Lead-owned changes as Integration Requests.
