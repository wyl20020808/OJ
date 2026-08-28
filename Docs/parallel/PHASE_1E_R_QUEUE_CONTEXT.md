# PHASE 1E-R Queue Recovery Context

Branch: `codex/phase1er-judge-queue-recovery`  
Worktree: `D:\OJPlatform-worktrees\phase1b-problem-authoring`

Preserve: one job per submission, concurrent duplicate enqueue, claim/lease, token ownership, duplicate completion, local Redis restart and fake labeling. Do not redesign Judge protocol or introduce a queue framework/migration without approved Lead request.

Required: Q01-Q19, R01-R10 and S01-S09. Allowed: `apps/api/src/modules/judge/**`, queue-focused tests, worker report `Docs/reports/OJPLATFORM_1E_R_WORKSTREAM_QUEUE_REPORT.md`. Forbidden: Auth internals, Web, central composition, migration registry, root manifests, PROJECT_STATUS and all source compilation/run/eval/shell/import.

Record any shared API/runtime need as an Integration Request. Stop after committed scoped evidence or immediately on source-execution/security defect.

