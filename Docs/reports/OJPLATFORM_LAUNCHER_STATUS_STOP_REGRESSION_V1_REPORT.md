# OJPlatform Launcher Status/Stop Regression V1

Status: PARTIAL

## Root Cause

Canonical source resolution ran before `status` and `stop`. This made read-only status and shared-runtime stop depend on main/plugin worktree discovery. Status also performed slow WSL Docker inspection, causing apparent no-response behavior when WSL was unavailable. Status BAT always paused after success.

## Fix

- `status` and `stop` skip canonical source discovery unless explicit source selection is requested.
- Status uses shared registry identity when available and fast localhost TCP/HTTP authoritative probes.
- Stop keeps shared ownership control and adds explicit active-job guard (`STOP BLOCKED: ACTIVE JUDGE JOBS = N`).
- Status/Stop BATs pause only on error and print failure context; successful status no longer blocks.
- Start/Restart canonical resolution and version-aware behavior remain unchanged.

## Validation

- BAT Status reproduced output without source-resolution failure.
- Status all-down/infrastructure probe path completed with visible `DOWN`/`REACHABLE` output.
- Explicit feature source reports `CANONICAL = False`.
- Invalid explicit source remains fail-closed.
- PowerShell parse: PASS.
- `git diff --check`: PASS.
- Real Stop smoke: NOT RUN; active runtime/qualification coordination and stale process state made destructive stop unsafe.
- PowerShell 7: NOT VERIFIED separately.

## Safety

No user artifacts deleted or moved. No Product/JudgeData/UI changes. No merge to main.
