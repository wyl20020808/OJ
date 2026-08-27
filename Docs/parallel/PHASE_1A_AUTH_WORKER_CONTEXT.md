# Phase 1A Auth Worker Context

Branch: `codex/phase1a-auth`
Worktree: `D:\OJPlatform-worktrees\phase1a-auth`
Allowed: `apps/api/src/modules/auth/**`, `apps/api/src/modules/user/**`, Auth/User tests, `packages/database/migrations/0001_auth_foundation.sql*`, this report, and this context only as needed for evidence.
Forbidden: shared contract, API composition/route registry, migration runner, root manifests, Web, Problem, `Docs/PROJECT_STATUS.md`, `Goals/`.
Public contracts: `Docs/architecture/PHASE_1A_SHARED_CONTRACT.md` (read-only), especially Auth, AuthContext, errors, and policy.
Acceptance: implement only the Auth/User foundation; no plaintext passwords or unsafe token storage; cover validation, duplicate identity, disabled account, session, and safe errors; create `Docs/reports/OJPLATFORM_1A_WORKSTREAM_AUTH_REPORT.md`; record integration requests.
Integration: leave central registration to Lead; provide a documented module registration function and public policy/context types.
