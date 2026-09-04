# OJPlatform Cross-Worktree Runtime Control V1

Status: PASS

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

## Runtime validation

The implementation was developed in the isolated
`cross-worktree-runtime-control` checkout. A detached same-commit peer
checkout was used for cross-worktree control verification, preserving the
user's Root and Final Integration checkouts. The existing Root entry points
gain this behavior when this scoped branch is integrated into Root.

| Case | Evidence | Result |
| --- | --- | --- |
| A | Candidate `start`; peer `status` reported the shared owner checkout and API, Web, Judge Service, Host Agent, Supervisor, and Worker as running from another checkout. | PASS |
| B | Peer normal `stop` removed all application listeners and left PostgreSQL, Redis, and MinIO running. | PASS |
| C | Candidate `start`; peer `stop -All` stopped all three Compose containers. The named PostgreSQL, Redis, and MinIO volumes remained present. | PASS |
| D | Peer `start`; candidate `status` reported the peer-owned runtime. A final candidate `restart` followed by peer `status` reported all application services as `RUNNING_OJPLATFORM_OTHER_CHECKOUT`. | PASS |
| E | A temporary PowerShell listener on `127.0.0.1:3180` (PID 23408) caused `start` to stop at `host-agent port 3180 is occupied by an unknown process.` The listener remained alive until the test explicitly stopped that exact PID. | PASS |
| Idempotence | A repeated candidate `start` reported infrastructure and every application service as `REUSE`; Worker remained `cpp20-gcc-13-v1-1788443255952-1`. | PASS |

Final status probes reported PostgreSQL, Redis, MinIO, API, Web, Judge
Service, Host Agent, Supervisor, and Worker as running. Web returned HTTP 200
at `http://127.0.0.1:5173`; API health returned HTTP 200 at
`http://127.0.0.1:3010/health`.

No Docker volume, unrelated Docker resource, or unrelated process was deleted
or stopped. The only non-OJPlatform process terminated was the explicit
temporary Case E listener after its safety check completed.
