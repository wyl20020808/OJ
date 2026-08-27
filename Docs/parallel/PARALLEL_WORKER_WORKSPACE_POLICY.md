# Permanent Parallel Worker Workspace Policy

## Purpose

OJPlatform uses three permanent Worker Slots and one Lead Integration slot. Physical paths are stable; Git branches rotate per approved Parallel Wave.

## Slots and lifecycle

The lifecycle is: Lead Bootstrap -> Common Baseline -> Branch Rotation -> three workers receive the new Goal ZIP -> Worker Reports -> Lead Audit -> Lead Integration -> Real Runtime E2E -> Full Regression -> Phase decision -> next Branch Rotation.

Before rotation, Lead must verify `WORKTREE CLEAN = YES`, `OLD BRANCH MERGED = YES`, and `NEW BASELINE APPROVED = YES`. The three new branches are created from the same approved `master`/main HEAD and their starting HEADs must match. Physical directories are never renamed for a phase number.

Rotation is prohibited when any precondition is false. Never use `git reset --hard`, `git clean -fd`, `git checkout -f`, forced worktree removal, or forced branch deletion to handle unknown files. Stop and report a blocker instead.

## Ownership

Workers modify only their assigned module and tests. Root manifests and lockfiles, `AGENTS.md`, `Docs/PROJECT_STATUS.md`, shared contracts, central API/bootstrap and route composition, migration runner/registry, shared CI, and other Worker scopes are Lead-owned. A required shared change is recorded as an Integration Request and implemented by Lead.

Every Worker Goal creates a permanent report at `Docs/reports/<GOAL_ID>_REPORT.md`. Workers never update `PROJECT_STATUS`; Lead owns final status and Phase reports. Failed, partial, and blocked work retains its evidence.

## Goal ZIP delivery

Each Parallel Wave consists of one Bootstrap Goal, three Worker Goal ZIPs, and one Lead Integration Goal ZIP. Worker Goals normally target 45-75 minutes of focused work; 60-120 minutes is acceptable when the task is naturally larger. High-coupling or high-risk work (major migrations, Submission/Judge/Sandbox, production security, or deployment) is not split merely to increase parallelism.

Dependency installation uses the repository's canonical frozen install. New phases do not create new Codex Projects or new physical worktrees; they rotate branches in the existing slots.

