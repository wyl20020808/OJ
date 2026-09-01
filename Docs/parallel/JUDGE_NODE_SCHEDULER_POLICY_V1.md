# Judge Node Scheduler Policy V1

Scheduler Policy V1 is deterministic and capability-aware. For each queued or
retryable Judge job, the service derives the required language profile,
execution mode, and checker from immutable job input, then:

1. filters to current, fresh `ONLINE` or capacity-available `BUSY` nodes;
2. excludes draining, offline, unhealthy, stale-incarnation, full-capacity,
   version-incompatible, and capability-incompatible nodes;
3. selects the lowest normalized load, `activeJobs / maxConcurrentJobs`;
4. breaks an equal-load tie by ascending `nodeId`.

The selected assignment binds `judgeJobId`, `nodeId`, node incarnation, and
attempt generation. The existing lease claim remains the concurrency authority:
another scheduler pass cannot create an accidental concurrent assignment for
the same job. A node must present that current incarnation to claim and finish
the assignment.

When there is no eligible node, the scheduler returns
`NO_COMPATIBLE_JUDGE_NODE` truthfully and dispatches nothing. It never routes a
job to a node without `cpp20-gcc-13-v1`, the required checker, or the required
execution mode. Current qualified capability values are `cpp20-gcc-13-v1`,
`EXACT_BYTES`, `TOKEN_WHITESPACE`, and the existing safe/real execution modes.

This policy is deliberately not autoscaling, cloud provisioning, random load
balancing, multi-language dispatch, SPJ, contest scoring, or a new recovery
protocol. Scheduler decision reasons and safe node load/state are observable;
credentials, lease tokens, source, and testdata are not.
