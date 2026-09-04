# OJPlatform Launcher Status/Stop Regression V1

Status: PASS (merge/static integration); real Stop smoke deferred.

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

No user artifacts deleted or moved. No Product/JudgeData/UI changes.

Launcher fix merged to canonical `main` with merge commit
`2b51c63984fb4fdf2e01b346a3d52123e6153089`. `D:\OJPlatform` normalized to
branch `main` at the same merge commit. Root Status BAT produced visible
all-down/runtime output. Real Stop smoke remained deferred.

Follow-up regression fix (2026-09-05): root BAT reproduced 16s Status and 12s
Stop waits despite successful exit. Status now avoids HTTP probes when TCP port
is closed and uses one-second health timeout. Stop short-circuits already-down
services. Root Status/Stop remain visible and return success without full runtime
startup.

User follow-up fix: stale records for already-closed ports are now removed
before ownership probing, preventing Stop from stalling after the first service.
Status BAT pauses on successful output so double-click users can read it.

Additional root-entry fix: BATs now print immediate progress before PowerShell
starts and hold successful output for two seconds before exiting.
