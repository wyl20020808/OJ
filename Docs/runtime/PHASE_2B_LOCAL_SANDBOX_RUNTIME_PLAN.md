# PHASE 2B Local Sandbox Runtime Plan

This bootstrap freezes design only; no runtime implementation starts here.

1. Define the Supervisor process and typed contract.
2. Build an immutable minimal OCI root and probe registry.
3. Apply user/mount/PID/network namespaces, cgroup v2, seccomp/LSM, dropped capabilities and no-device policy.
4. Stage only hashed trusted probes and controlled inputs.
5. Add bounded result collection, cancellation and cleanup verification.
6. Execute the complete SB/FS/NET/PS/RL/ENV/LC/WI matrix under WSL2 and record raw evidence separately from sanitized API diagnostics.
7. Integrate with the Worker only after isolation gates pass. Keep `REAL_SUBMISSION_EXECUTION` fail-closed throughout.

The plan must include fault injection for backend unavailable, namespace/mount/cgroup failure, stale supervisor, cancellation race, concurrent jobs and cleanup failure. No direct application PostgreSQL access is permitted.

