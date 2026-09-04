# OJPlatform Canonical Runtime Source V1 Report

Status: PARTIAL

## Root Cause

Runtime source and worker build paths were resolved from invocation checkout. Vite also hard-coded historical OnlineCodeEditor worktree alias. Healthy services reused without comparing requested source version.

## Implemented

- Shared registry at `%LOCALAPPDATA%\OJPlatform\runtime\ojplatform-local`.
- Canonical product/plugin main worktree discovery.
- Explicit `-SourceRoot`, `-PluginSourceRoot`, `-UseCurrentCheckout` with registered-worktree and tracked-clean gates.
- Process records include source root, branch, commit, plugin identity, start time, worker binary hash metadata.
- Version-aware service reuse and active-job mismatch guard.
- Worker reuse requires source identity, commit, binary hash match.
- Vite plugin resolution uses `OJPLATFORM_ONLINE_CODE_EDITOR_ROOT`.
- Status prints product/plugin identity, canonical flags, mixed-source state, worker binary hash.

## Validation

- PowerShell parse: PASS.
- Web TypeScript check: PASS.
- `git diff --check`: PASS.
- Runtime start/browser proof: NOT VERIFIED; intentionally not run.
- Root/plugin checkout normalization: NOT NEEDED for implementation; existing worktrees and untracked artifacts preserved.

## Safety

No user artifacts deleted or moved. Legacy ownership and external-owner fail-closed code retained. Product/Judge/UI remediation branches not merged.

## Follow-up

Add focused tests for canonical resolution, version mismatch, plugin mismatch, active-job guard. Run controlled Stop/Start and browser proof after merge when no active Judge jobs exist.
