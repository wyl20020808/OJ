# Judge Admin Observability Matrix V1

Cluster summary exposes node counts, active jobs, total/schedulable capacity, stale count and generation time. Node DTO exposes identity, desired/observed state, runtime/capacity/heartbeat/capabilities and controlVersion only. Metrics are bounded state/capacity counters; no Prometheus system or unbounded history is introduced. Unsupported projections are explicit reserved fields for 2C.8B/2C.8C.
