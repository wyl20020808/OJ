# Phase 2A Parallel Ownership

All branches begin from one Lead-created common bootstrap commit. No new worktrees are created.

| Slot and permanent path | Branch | Owns | Must not own |
|---|---|---|---|
| Auth: `D:\OJPlatform-worktrees\phase1b-authz` | `codex/phase2a-worker-authz` | Worker diagnostic/operator visibility authorization, cancellation/control authorization if exposed, audit hooks, safe capability visibility, tests | Go runtime, Redis claim loop, source execution, Web |
| Backend: `D:\OJPlatform-worktrees\phase1b-problem-authoring` | `codex/phase2a-worker-runtime` | Go Worker process, public protocol implementation, queue adapter, identity/capabilities, heartbeat, fixtures, cancellation observation, lifecycle, tests | Source execution, Sandbox, Auth internals, Web |
| Web: `D:\OJPlatform-worktrees\phase1b-web-authoring` | `codex/phase2a-worker-ops-ui` | Server-backed operational/execution-stage UX, privileged diagnostics if contract permits, cancellation UX if frozen, responsive/a11y/tests | Direct Worker/Redis access, secrets/lease tokens, real verdict UI |

Lead owns shared contracts, protocol registry, API composition, runtime orchestration, worker registration/control composition, multi-process qualification, `PROJECT_STATUS`, integration, and closure. Workers submit shared-file changes through `PHASE_2A_INTEGRATION_REQUESTS.md` and do not alter root manifests, lockfiles, migrations, common contracts, or project status directly.
