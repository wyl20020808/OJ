# Phase 1A Problem Worker Context

Branch: `codex/phase1a-problem`
Worktree: `D:\OJPlatform-worktrees\phase1a-problem`
Allowed: `apps/api/src/modules/problem/**`, Problem tests, `packages/database/migrations/0002_problem_foundation.sql*`, this report, and this context only as needed for evidence.
Forbidden: shared contract, API composition/route registry, migration runner, root manifests, Web, Auth, `Docs/PROJECT_STATUS.md`, `Goals/`.
Public contracts: `Docs/architecture/PHASE_1A_SHARED_CONTRACT.md` (read-only), especially Problem, pagination, errors, and AuthorizationPolicy.
Acceptance: implement only Problem foundation/list/detail/create/update/visibility transitions; persist version references, never execute testdata; authorize through the public policy boundary; create `Docs/reports/OJPLATFORM_1A_WORKSTREAM_PROBLEM_REPORT.md`; record integration requests.
Integration: leave central registration to Lead and expose a documented module registration function.
