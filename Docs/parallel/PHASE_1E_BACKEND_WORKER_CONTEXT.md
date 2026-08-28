# PHASE 1E Backend Worker Context

Branch: `codex/phase1e-judge-queue`
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`
Allowed: JudgeJob domain/repository, Redis queue adapter, allocated `0006_judge_job_queue_foundation` only if required, submission linkage, deterministic fake plumbing and tests, plus worker report.
Forbidden: Auth internals, Web, central migration registry/bootstrap, root manifests, shared contracts, PROJECT_STATUS, and any source compilation or execution.
Contract: `Docs/architecture/PHASE_1E_JUDGE_PROTOCOL_QUEUE_CONTRACT.md` and ownership matrix.
Acceptance: at-least-once, lease/retry/stale recovery and duplicate-safe persistence are tested; fake outcomes are marked FAKE.
Report: `Docs/reports/OJPLATFORM_1E_WORKSTREAM_JUDGE_QUEUE_REPORT.md`.
Integration: use `PHASE_1E_INTEGRATION_REQUESTS.md` for shared changes.

