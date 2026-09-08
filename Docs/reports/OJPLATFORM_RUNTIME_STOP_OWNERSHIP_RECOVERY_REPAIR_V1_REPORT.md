# OJPlatform Runtime Stop Ownership Recovery Repair V1

Date: 2026-09-08

Status: PARTIAL

## ROOT CAUSE

`Stop-Managed` classified a listener as `EXTERNAL` when the shared runtime
registry did not match PID, port, and immutable process start time. The existing
command check required a known checkout path in the process command line. The
Runtime Manager launches Node services with relative entry paths, for example
`node --import tsx apps/judge-host-agent/src/server.ts`, so a genuine orphan
could lack both registry state and an explicit checkout path.

## OLD BEHAVIOR

Registry miss became `EXTERNAL`, stop refused, and the final port guard raised
`APPLICATION_PORT_REMAINS_OCCUPIED` without enough process evidence or a direct
manual remediation command.

## NEW OWNERSHIP CLASSIFICATION

- `PROVEN_OWNED`: registry PID, port, and process start time match.
- `ORPHANED_OJPLATFORM_PROCESS`: registry is absent/stale, but process evidence
  matches a known OJPlatform root or the exact Runtime Manager Node launch
  contract with the configured Node executable.
- `EXTERNAL`: listener identity does not match a trusted OJPlatform contract.
- `UNKNOWN`: process identity is unavailable.

Evidence now includes PID, process name, executable path, command line, parent
PID, listening port, expected service role, and registry identity.

## ORPHAN RECOVERY CONTRACT

Verified orphans log `ORPHAN DETECTED`, identity, PID, port, and `ACTION =
TERMINATE`. Termination uses `taskkill /PID <pid> /T /F` first, with a scoped
PowerShell fallback, then bounded polling logs `PORT <port> RELEASED`. Successful
recovery removes the service registry record and reports `STOP (orphan
recovered)`.

## EXTERNAL SAFETY CONTRACT

Unverified or ambiguous listeners are never terminated automatically. Stop
prints service, port, PID, process name, executable path, command line, parent
PID, identity, reason, and copyable commands:

```text
PowerShell: Stop-Process -Id <PID> -Force
CMD: taskkill /PID <PID> /T /F
```

The output instructs the operator to confirm OJPlatform ownership first.

## REAL 3180 EVIDENCE

Reproduced on 2026-09-08 after a normal start, then removed only the
`host-agent` registry entry. Listener evidence:

- PID: `35560`
- Process name: `node.exe`
- Executable path: `C:\Program Files\nodejs\node.exe`
- Command line: `node --import tsx apps/judge-host-agent/src/server.ts`
- Parent PID: `41968`
- Port: `3180`

The repaired stop classified it as `VERIFIED_OJPLATFORM`, terminated the
process tree, observed `PORT 3180 RELEASED`, cleaned registry state, and passed.

## TEST RESULTS

- `scripts/test-dev-runtime-ownership.ps1`: PASS
- `scripts/test-runtime-stop-ownership-recovery.ps1`: PASS
- `scripts/test-stop-manual-recovery-v2.ps1`: PASS
- `scripts/test-canonical-main-launcher.ps1`: PASS
- PowerShell parser validation: PASS
- `git diff --check`: PASS

Focused tests cover owned stop, registry-missing orphan recovery, unrelated
external process, generic Node false positive, child-tree termination, delayed
port release, retained state after failed release, diagnostics, and subsequent
start/stop logic.

## START/STOP RESULTS

First real `Start`: PASS. `Status`: PASS with `SOURCE MATCH = YES`, `VERSION
MATCH = YES`, `MIXED SOURCE = False`. First real `Stop`: PASS.

Second real `Start` and the required post-orphan-recovery `Start`: BLOCKED
outside this repair by existing Judge Worker state. Worker recovery returned
HTTP 409 and node provisioning returned `HOST_CAPACITY_EXHAUSTED`. Both partial
starts were cleaned by the official `Stop`, which passed. No source, Judge
business, or product files were changed for that issue.

## USER FILE SAFETY

Initial dirty tracked file `Docs/PROJECT_STATUS.md`, all untracked artifacts,
and existing stash were preserved. `git clean`, `git reset --hard`,
`git checkout -- .`, `git restore .`, and stash deletion were not used.

## FINAL

STOP NOW HANDLES VERIFIED ORPHANS: YES

TRUE EXTERNAL PROCESS SAFETY PRESERVED: YES

ACTIONABLE MANUAL REMEDIATION: YES

READY FOR USER RETEST: YES

Overall status is `PARTIAL` because second full startup was blocked by an
unrelated pre-existing Worker capacity condition.
