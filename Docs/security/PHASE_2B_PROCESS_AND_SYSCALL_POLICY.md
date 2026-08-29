# PHASE 2B Process and Syscall Policy

Each Guest uses isolated user and PID namespaces, a non-root identity, no ambient capabilities, no devices, and no host process namespace. The Guest cannot signal or ptrace unrelated host processes. Mount and namespace creation are Supervisor-only operations.

The Supervisor applies a reviewed seccomp profile before start and denies privilege escalation, namespace creation, mount, ptrace, raw devices, kernel-module, reboot, keyring and other unnecessary escape primitives. The exact profile is versioned and hashed with the qualification artifact. AppArmor or an equivalent LSM profile is an additional layer when available.

Process and thread counts are cgroup/policy limits. The Supervisor owns signals and cancellation. A process-limit or syscall violation is a qualification outcome, not a Judge verdict. No kernel exploit development is part of this phase.

