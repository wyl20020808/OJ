# Judge Node Lifecycle State Machine V1

Start is `STOPPED -> STARTING -> REGISTERING -> ONLINE`. Safe stop is `ONLINE/BUSY -> DRAINING -> activeJobs=0 -> OFFLINE -> STOPPING -> STOPPED`; restart completes the stop path before starting a new incarnation. Active jobs are never force-killed by default. Stale incarnation heartbeats/completions are rejected.
