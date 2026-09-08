# OJPlatform Runtime Stop Ownership Recovery Finalize V1

Date: 2026-09-08

Status: PARTIAL

## Git Persistence Audit

Canonical branch was `main`; initial `HEAD` and `refs/heads/main` both resolved
to `c8e628f330f67944816ed94cb1c49cf482a34389`. The repair was not present in
that commit, not staged, and not found as a separate committed repair. It was
located in the dirty worktree:

- modified `scripts/dev-runtime.ps1`
- modified `scripts/test-dev-runtime-ownership.ps1`
- untracked `scripts/test-runtime-stop-ownership-recovery.ps1`
- untracked repair report

The prior report recorded equal before/after heads because runtime validation
was performed from uncommitted worktree content. The result proved behavior but
did not persist it in Git.

The four repair files were staged by exact path and committed as:

```text
c0010a0c741ae4038e4e1db4e29fcee473ee24b5
fix(runtime): recover verified orphan processes on stop
```

Pre-existing `Docs/PROJECT_STATUS.md` changes, untracked artifacts, and stash
`stash@{0}: codex-preserve-user-project-status-before-team-merge` were excluded
from the code repair commit.

## Repair Content Audit

Committed repair includes:

- `PROVEN_OWNED` classification from registry PID, port, and process start time
- `ORPHANED_OJPLATFORM_PROCESS` for strongly verified OJPlatform identity
- `EXTERNAL` and `UNKNOWN` fail-closed behavior
- PID, process name, executable path, command line, parent PID, port, expected
  service role, and registry identity evidence
- exact relative launch-contract support, including Host Agent
  `node --import tsx apps/judge-host-agent/src/server.ts`
- configured Node executable verification for relative launch contracts
- generic and unrelated Node false-positive protection
- verified process-tree termination through `taskkill /T /F`
- bounded port-release polling
- successful registry cleanup and retained state on failed release
- actionable external diagnostics and PowerShell/CMD remediation commands

## Committed-State Validation

All required repair files had empty `git diff HEAD` after commit.

- `scripts/test-dev-runtime-ownership.ps1`: PASS
- `scripts/test-runtime-stop-ownership-recovery.ps1`: PASS
- `scripts/test-stop-manual-recovery-v2.ps1`: PASS
- `scripts/test-canonical-main-launcher.ps1`: PASS
- PowerShell parser validation: PASS
- `git diff --check`: PASS

## Real Runtime Retest

The previous real 3180 registry-loss reproduction remains valid evidence: PID
`35560` was classified as a verified OJPlatform orphan, its process tree was
terminated through normal Stop flow, port 3180 was released, registry state was
cleaned, and Stop passed. Repeating destructive registry manipulation was not
needed after committed-state focused tests passed.

Committed-state `OJPlatform-Start.bat` was attempted. It was blocked before a
complete lifecycle because two existing `judge-worker.exe` processes held the
canonical Worker binary open. Read-only inspection found PIDs `29788` and
`14180`. This is independent of Stop ownership classification.

`OJPlatform-Status.bat` remained available, but reported unregistered running
services and `MIXED SOURCE = True`. Official `OJPlatform-Stop.bat` then failed
closed because the Judge admin query returned HTTP 401 and active-job state
could not be determined. No process was manually killed.

Classification:

```text
OUT_OF_SCOPE_EXISTING_JUDGE_RUNTIME_ISSUE
JUDGE CAPACITY ISSUE = INDEPENDENT
```

No Judge business, scheduling, capacity, Worker, Product, Web, Team, Tags,
Discussion, Problem, Assignment, or Homework code was modified.

## Safety

- `git clean`: not used
- `git reset --hard`: not used
- checkout/reset/restore of user work: not used
- stash deletion: not used
- existing dirty and untracked user artifacts: preserved
- automated or manual termination after unknown active-job state: not used

## Result

Stop repair is formally persisted and committed-state tests pass. Overall task
status is `PARTIAL` because real committed-state lifecycle completion was
blocked by independent existing Judge runtime state. Stop repair is ready for
user use; Judge runtime recovery remains deferred.
