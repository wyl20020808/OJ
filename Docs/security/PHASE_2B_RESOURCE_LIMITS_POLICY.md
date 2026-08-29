# PHASE 2B Resource Limits Policy

Every probe receives bounded CPU time, wall time, memory, process/thread count, stdout/stderr bytes, workspace bytes and an optional open-file limit. Defaults and hard maxima are versioned policy values, validated before start, and enforced by cgroup v2 and Supervisor watchdogs.

Cancellation has a bounded grace period followed by Supervisor-owned termination. CPU burn, wall sleep, memory pressure, child fanout, output flood, large file growth, cancellation under pressure and concurrent accounting are trusted probes. Outcomes are `QUALIFICATION_LIMIT`, `QUALIFICATION_CANCELLED` or an explicit setup/cleanup failure; they are not TLE/MLE/OLE.

