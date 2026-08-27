# PHASE 1C Problem Worker Context

Branch: `codex/phase1c-submission-backend`
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`

Allowed: Submission domain/validation/repository/service/API module and tests, migration `0005_submission_intake.sql` plus `.down.sql`, and this context/report.
Forbidden: Auth internals, Web, shared contracts, central composition, migration runner/registry, root manifests, `PROJECT_STATUS`, and `Goals/`.
Contract: `Docs/architecture/PHASE_1C_SHARED_CONTRACT.md` (read-only).
Acceptance: stable intake model, immutable source/testdata references, PENDING/QUEUED semantics, create/list/detail, pagination, constraints/indexes, and policy dependency. Never execute source or testdata and never fabricate verdicts.
Report: `Docs/reports/OJPLATFORM_1C_WORKSTREAM_PROBLEM_REPORT.md`.
Integration: record Lead-owned registration/wiring needs as Integration Requests.

