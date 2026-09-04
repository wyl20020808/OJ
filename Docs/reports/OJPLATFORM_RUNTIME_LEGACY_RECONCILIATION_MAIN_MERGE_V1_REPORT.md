# OJPlatform Runtime Legacy Reconciliation Main Merge V1

## Result

`PARTIAL`

Runtime Legacy Reconciliation was merged into canonical `main` with merge
commit `214fb0c`. Static validation, focused ownership tests, and root status
evidence pass. Root Stop/Start/Restart smoke was not run because an unrelated
Judge job remained active throughout this session; stopping Runtime would have
interrupted it.

## Merge

- Canonical main worktree: `D:\OJPlatform-worktrees\final-feature-integration`
- Main before merge: `cdb07ea44ed3be4b1a028a02622fce84059c7d9e`
- Source: `codex/runtime-legacy-reconciliation-v1`
- Source implementation commit: `99abc3e0a5b0bd59e2a940dfc2beec381db53afa`
- Merge commit: `214fb0c`
- Conflicts: none
- Source implementation included: yes

## Validation

- PowerShell 5.1 parse: PASS
- PowerShell 7 parse: PASS
- Runtime ownership focused tests: PASS on PowerShell 5.1 and PowerShell 7
- `git diff --check`: PASS
- Root BAT wiring: PASS; Start, Stop, Restart, and Status invoke
  `scripts/dev-runtime.ps1`
- Canonical root Status: PASS for PostgreSQL, Redis, MinIO, Product API, Judge
  Service, Host Agent, Supervisor, Worker, and Web ownership/health probes.
- Web HTTP: `200` at `http://127.0.0.1:5173`
- API health: `ok` at `http://127.0.0.1:3010/health`

## Runtime Smoke

Root Stop, Status-after-stop, Root Start, and Root Restart were intentionally
not executed. Judge Service reported one active job on
`cpp20-gcc-13-v1-1788409555979-1` (`BUSY`) during repeated checks. The existing
Runtime was left running and no job was interrupted.

## Safety

- User untracked artifacts: untouched
- Product/Web/Judge feature code: untouched
- Unrelated processes: untouched
- Docker volumes: untouched
- Services left running: yes

