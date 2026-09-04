# OJPlatform Cross-Worktree Runtime Control V1

Status: IN PROGRESS

## Root cause

The prior manager stored `.runtime/state.json`, lock, secrets, and process
records below the checkout that invoked it. A runtime started from another
worktree therefore had no ownership evidence when Root `status` or `stop` ran.

## Shared state model

The canonical local runtime is `ojplatform-local`. Its shared registry is
`%LOCALAPPDATA%\OJPlatform\runtime\ojplatform-local`. It contains instance
identity, owner checkout, per-process PID/start time/command/port identity,
generated local secrets, and shared lock. Writes use a temporary replacement.
Checkout-local `.runtime/bin` remains the source-specific worker artifact area.

## Authoritative probes

| Resource | Status source |
| --- | --- |
| Web | HTTP 200 plus Windows listener/process identity |
| API | HTTP `/health` plus Windows listener/process identity |
| Judge | HTTP `/health` plus Windows listener/process identity |
| Host Agent | authenticated HTTP `/health` plus listener/process identity |
| Supervisor | Supervisor health plus WSL user systemd unit |
| Worker | Judge Service node registry and heartbeat |
| Infrastructure | Docker Compose project, container health, mapping, network, host reachability |

Unknown listeners fail closed as `BLOCKED_BY_EXTERNAL_OWNER`. Named Docker
volumes are not deleted by any Runtime Manager path.
