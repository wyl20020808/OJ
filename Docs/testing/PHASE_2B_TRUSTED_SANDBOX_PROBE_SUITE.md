# PHASE 2B Trusted Sandbox Probe Suite

All probes are repository-owned, fixed, versioned, hashed, bounded and non-destructive. They are selected from an immutable registry and cannot be replaced by Submission input.

| Family | Fixed probe purposes |
|---|---|
| FS | workspace read/write; denied host marker; denied outside write; traversal and symlink escape |
| NET | controlled endpoint denied; Redis/API endpoint denied; no DNS/route; bind denied |
| PROC | PID isolation; bounded child creation; controlled signal/ptrace denial; privilege/syscall denial |
| RES | CPU burn; wall sleep; memory pressure; output flood; file growth; process fanout |
| ENV | enumerate visible keys; verify DB/Redis/session/object-store/host/proxy markers absent |
| CLEAN | child cleanup; cancellation; forced termination; orphan, cgroup, mount and workspace absence |

Registry fields are `probe_id`, version, SHA-256 hash, purpose, immutable artifact reference, expected bounded behavior and timeout. No kernel exploit, credential theft, network scan or destructive host write is permitted.

