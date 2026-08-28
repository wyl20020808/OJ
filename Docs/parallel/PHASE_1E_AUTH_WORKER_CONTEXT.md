# PHASE 1E Auth Worker Context

Branch: `codex/phase1e-judge-authz`
Worktree: `D:\OJPlatform-worktrees\phase1b-authz`
Allowed: Auth/public policy, AuthContext integration surface, job visibility and privileged action authorization, audit hooks and tests, plus worker report.
Forbidden: queue backend, migrations/registry, root manifests, shared contracts, central bootstrap, PROJECT_STATUS, Web/Problem internals, and all source execution.
Contract: `Docs/architecture/PHASE_1E_JUDGE_PROTOCOL_QUEUE_CONTRACT.md` and ownership matrix.
Acceptance: policy checks are public-boundary based, deny unauthorized actions, preserve security logging rules, and pass scoped tests.
Report: `Docs/reports/OJPLATFORM_1E_WORKSTREAM_JUDGE_AUTHZ_REPORT.md`.
Integration: use `PHASE_1E_INTEGRATION_REQUESTS.md` for shared changes.

