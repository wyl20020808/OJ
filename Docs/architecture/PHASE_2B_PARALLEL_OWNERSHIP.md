# PHASE 2B Parallel Ownership and Branch Rotation

Use only the existing permanent worktrees. No new worktree is permitted.

| Slot | Existing path | Bootstrap branch | Scope |
|---|---|---|---|
| Security/Auth | `D:\OJPlatform-worktrees\phase1b-authz` | `codex/phase2b-sandbox-security-policy` | threat model, policies, authz, audit |
| Runtime | `D:\OJPlatform-worktrees\phase1b-problem-authoring` | `codex/phase2b-sandbox-runtime` | Supervisor, isolation, probes, cleanup |
| Web | `D:\OJPlatform-worktrees\phase1b-web-authoring` | `codex/phase2b-sandbox-ops-ui` | safe qualification UX only |

The Lead creates one common Phase 2B bootstrap commit. All three branches are then created or rotated from exactly that commit, with clean worktrees verified before switching. No force, reset, history rewrite or deletion of existing user work is allowed.

