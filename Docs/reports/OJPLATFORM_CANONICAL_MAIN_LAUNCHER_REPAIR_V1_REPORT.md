# OJPlatform Canonical Main Launcher Repair V1

Date: 2026-09-07

Status: PARTIAL

## Root Cause

`Resolve-MainWorktree` required `git worktree list --porcelain` to contain an
entry with `branch refs/heads/main`. `D:\OJPlatform` is the canonical repository
but is currently checked out on a feature branch, so no registered main entry
exists and the resolver threw `CANONICAL_MAIN_NOT_FOUND`.

## Implemented

- Canonical product source resolves from repository root and local
  `refs/heads/main`, independent of worktree enumeration.
- Normal start verifies canonical root checkout is on `main` and matches local
  main HEAD; branch switching, reset, pull, and fetch remain absent.
- Status reports canonical root, branch, and HEAD while runtime is down.
- Runtime version compatibility now includes branch identity.
- Explicit source overrides remain available and continue using registered
  worktree and tracked-clean gates.

## Validation

- `scripts/test-canonical-main-launcher.ps1`: PASS.
- `OJPlatform-Status.bat` equivalent status command: canonical source reported;
  runtime down; no `CANONICAL_MAIN_NOT_FOUND`.
- `git diff --check`: PASS.
- Full normal start: NOT VERIFIED; current checkout is not `main`, so the new
  fail-closed guard correctly blocks startup with `CANONICAL_ROOT_NOT_ON_MAIN`.
- Existing ownership test has a pre-existing mocked-port expectation failure;
  no product runtime code was changed for it.

## Contract

Desired source is always local `D:\OJPlatform` at current `main` HEAD. Runtime
registry describes observed state only. Stale commits and non-canonical roots
must reconcile only after ownership and active-job safety checks.
