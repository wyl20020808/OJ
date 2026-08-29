# PHASE 2B Sandbox Threat Model

Status: bootstrap design; runtime controls are not implemented or qualified.

## Scope and Trust Zones

Future submitted programs are fully hostile. The trust zones are: Lead/API and PostgreSQL; Judge Worker; Sandbox Adapter; Sandbox Supervisor; isolated Sandbox Guest; immutable runtime/probe assets; per-job workspace; testdata; and result collection. The Worker is trusted infrastructure, but its process boundary is not itself a Sandbox.

The Guest must not be trusted with a command, executable path, mount, network target, environment, privilege, syscall policy, or output path. Only the Supervisor may select a repository-owned probe and construct the isolated guest.

## Threats

The model covers host filesystem and source disclosure, credentials and service access, cross-job/testdata access, process enumeration/signalling/ptrace, namespace and mount abuse, device access, fork/thread/process bombs, CPU/memory/output/file exhaustion, network access including WSL localhost, orphan persistence, concurrent-job interference, syscall abuse, cleanup failure, and misleading verdict or audit data.

## Security Invariants

Failure of isolation, policy validation, resource accounting, or cleanup is security-significant and fails closed. The Guest receives no application credentials, no raw lease token, no source from another job, no host bind mount, and no real-submission execution mode. Qualification results are not AC/WA/TLE/MLE/RE/CE verdicts.

## Environment Caveats

The observed WSL2 `/mnt/c` mount is writable and maps to the Windows host. WSL root has broad capabilities, so a future Supervisor must run with a deliberately reduced capability set and must not treat WSL root as proof of isolation. Docker's default profile is only one layer and is not a qualification result.

