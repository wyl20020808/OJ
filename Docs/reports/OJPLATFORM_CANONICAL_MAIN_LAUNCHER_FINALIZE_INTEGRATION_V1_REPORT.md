# OJPlatform Canonical Main Launcher Finalize & Integration V1

Date: 2026-09-07

## Outcome

**PASS** for canonical launcher integration and real start smoke.

## Discovery

- Root before: branch `codex/generated-fixture-cleanup-maintenance-v1`, HEAD `9326e71f0f27babb40c209587b1bc5bf29d7be16`.
- Main before: `f9da2e1ab2c48842f07d457d55f614efa8fb70b6`.
- Repair branch: `codex/generated-fixture-cleanup-maintenance-v1`.
- Repair commit: `6c10b841ce377ece6090214a2d34616a3861a27e`.
- Repair delivery: **VALID / COMMITTED**. `git show --stat` contains only `scripts/dev-runtime.ps1`, `scripts/test-canonical-main-launcher.ps1`, and the repair report.

## Integration

An isolated candidate `D:\OJPlatform-worktrees\launcher-finalize-integration-v1` on branch `codex/launcher-finalize-integration-v1` was created from local `refs/heads/main` and received the repair by cherry-pick (`6bcfeb2`). PowerShell parsing and `git diff --check` passed. The canonical launcher test passed from the canonical root. The same test is root-path-bound and cannot run unchanged from a non-canonical worktree; this is a test harness limitation, not a launcher failure.

Main was subsequently updated by the normal main integration merge `8d0353f6b51618a46a6a7d4e44458fed90af0898` (`merge: integrate main wave 1 launcher maintenance`). The merge audit shows launcher repair plus the related generated-fixture maintenance only; no Team, Discussion, Tags, Problem, Judge, Homework, Assignment, or other feature code was introduced by this integration.

## Canonical Root and Safety

- Root after: `D:\OJPlatform`, branch `main`.
- Canonical root HEAD: `8d0353f6b51618a46a6a7d4e44458fed90af0898`.
- `HEAD == refs/heads/main`: **YES**.
- Initial dirty tracked files and untracked artifacts were retained. Post-integration status still shows the pre-existing dirty `Docs/PROJECT_STATUS.md` and the existing untracked phase/report/fixture artifacts, including `tests/fixtures/phase3c-runtime-batch.zip`.
- `scripts/dev-runtime.ps1` repair content is present in the audited committed repair diff; no destructive overwrite or deletion was used.
- `git clean`: NOT USED. `git reset --hard`: NOT USED. `git stash`: NOT USED.

## Validation

- `scripts/test-canonical-main-launcher.ps1`: PASS.
- PowerShell syntax/static validation: PASS.
- `git diff --check`: PASS.
- Required canonical behaviors (local main ref, no worktree-list dependency, feature-worktree independence, branch mismatch fail-closed, explicit override, status while runtime down, version-aware desired source, and non-destructive dirty handling): covered by the focused launcher tests and repair audit.
- `OJPlatform-Status.bat`: PASS. Reports canonical root `D:\OJPlatform`, branch `main`, HEAD `8d0353f...`; neither `CANONICAL_MAIN_NOT_FOUND` nor `CANONICAL_ROOT_NOT_ON_MAIN` appears.

## Real Start Smoke

`D:\OJPlatform\OJPlatform-Start.bat` completed with exit code `0` and output `OJPlatform start PASS`. Migrations passed and services were reused/started from the canonical checkout. Runtime state and status report:

```text
RUNTIME ROOT   = D:\OJPlatform
RUNTIME BRANCH = main
RUNTIME COMMIT = 8d0353f6b51618a46a6a7d4e44458fed90af0898
SOURCE MATCH   = YES
VERSION MATCH  = YES
MIXED SOURCE   = False
```

API, Web, Judge Service, Host Agent, and Supervisor are RUNNING with that same source identity. The worker was recovered/reused during Start; status may transiently label its registry heartbeat `STALE`, while the overall Start contract and source identity passed. No active-job safety block occurred.

## Final Contract

- Latest definition: local `main` HEAD.
- Normal Start target: `D:\OJPlatform` / `main` / current local main HEAD.
- Auto fetch/pull/checkout/reset: **NO**.
- Canonical Main Launcher Finalize & Integration V1: **PASS**.
