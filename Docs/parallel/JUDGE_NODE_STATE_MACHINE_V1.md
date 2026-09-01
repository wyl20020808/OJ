# Judge Node State Machine V1

Phase 2C.7B persists a node record but does not infer health from row
existence. The explicit states are `REGISTERING`, `ONLINE`, `BUSY`,
`DRAINING`, `OFFLINE`, and `UNHEALTHY`.

| State | Meaning | Schedulable |
| --- | --- | --- |
| `REGISTERING` | Identity is being established. | No |
| `ONLINE` | Current incarnation is fresh and has spare capacity. | Yes |
| `BUSY` | Current incarnation is fresh; only if capacity remains. | Yes |
| `DRAINING` | No new work; active assignments may finish. | No |
| `OFFLINE` | Intentionally disabled or drained empty. | No |
| `UNHEALTHY` | Heartbeat timeout or failed health freshness. | No |

Allowed transitions are `REGISTERING -> ONLINE|OFFLINE|UNHEALTHY`,
`ONLINE -> BUSY|DRAINING|OFFLINE|UNHEALTHY`,
`BUSY -> ONLINE|DRAINING|UNHEALTHY`, `DRAINING -> OFFLINE|UNHEALTHY`,
`OFFLINE -> REGISTERING`, and `UNHEALTHY -> REGISTERING|OFFLINE`.
All other transitions are rejected. A draining node becomes `OFFLINE` only
after `activeJobs` reaches zero.

Registration establishes a current incarnation and enters `ONLINE` unless an
equivalent previously offline registration preserves operator intent. A fresh
heartbeat updates `lastHeartbeatAt` and derives `ONLINE` or `BUSY` from load.
The service marks a stale `ONLINE` or `BUSY` record `UNHEALTHY` during
registry refresh. Recovery is registration with the current incarnation, not a
second job-recovery system.

Drain and offline operations are idempotent control-plane actions. Existing
Judge leases continue to use the qualified queue retry/recovery semantics;
node health does not introduce a competing lease lifecycle. A prior process
cannot revive itself or complete an old assignment after a newer incarnation
has been registered.
