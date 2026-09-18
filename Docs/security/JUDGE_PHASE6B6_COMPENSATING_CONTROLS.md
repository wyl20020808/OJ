# Judge Phase 6B-6 Compensating-Control Record

Status: active for the Phase 6B-6 Linux amd64 candidate. This record does not qualify a production host. Native Linux evidence remains mandatory.

## MEDIUM-1 — amd64 default-allow seccomp

**Disposition:** `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL`.

**Risk.** A default-allow filter exposes non-denied Linux syscalls. The policy is architecture-specific and is weaker than a production-derived allowlist.

**Why direct mitigation is not chosen now.** The only implemented runtime is static C++20, but GCC 13, binutils, glibc, linker subprocesses, threading, signals, memory mapping, and filesystem operations use a broad and kernel-dependent syscall surface. The available host is WSL2. A WSL-derived allowlist could reject valid native-Linux workloads while creating a false qualification claim. No Internet/Docker profile is copied without workload evidence.

**Controls.** The amd64 filter denies mount/namespace reassociation, ptrace, kernel/module/reboot/swap control, BPF/perf, file-handle, userfaultfd, and keyring syscall classes. Every sandbox also has empty capabilities, `no_new_privs`, rootless runc, dedicated non-privileged host identity, PID/mount/network/IPC/UTS/user namespaces, cgroup CPU/memory/PID limits, read-only rootfs, bounded file/FD/output/time, private workspace, and verified cleanup. Bounded safe denial probes and the complete C++ sandbox regression pass.

**Residual risk.** An allowed syscall or kernel/runc defect may remain exploitable. The filter is amd64-only and does not qualify ARM64.

**Operational requirement.** Run the security suite after kernel, runc, compiler rootfs, toolchain, seccomp, OCI, or language-profile change. Patch the host promptly; keep execution hosts isolated from control-plane data and Docker privilege.

**Revisit trigger.** Native Linux qualification, addition of any language/runtime, GCC/glibc/rootfs change, kernel/runc major change, relevant sandbox incident/CVE, or availability of representative syscall traces. Native qualification must decide whether a tested allowlist is practical.

## MEDIUM-2 — explicit open-file limit

**Disposition:** `RESOLVED`.

Compile sandboxes use hard=soft `RLIMIT_NOFILE=128`; runtime sandboxes use 64. The values cover observed fixed GCC/static-C++ and normal runtime workloads while bounding pipes, sockets, and files. A bounded fixture attempts 80 opens, reaches the runtime limit, cleans up, and is followed by a successful job. Normal GCC compilation passes under 128.

## MEDIUM-3 — compile workspace/file limit

**Disposition:** `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL` for aggregate quota; explicit per-file mitigation is implemented.

**Risk.** `RLIMIT_FSIZE` limits one file, not many files. The compile workspace aggregate monitor has a short sampling window and is not a filesystem project quota.

**Why a kernel aggregate quota is not chosen now.** The deployment must work on ordinary local ext4/xfs hosts without introducing privileged per-job mount orchestration, loop devices, filesystem project-ID lifecycle, or an unqualified filesystem stack. WSL cannot qualify production ext4/xfs quota behavior.

**Controls.** Compile hard=soft `RLIMIT_FSIZE=16 MiB`; runtime 512 KiB. Compile aggregate budget remains 32 MiB with 10 ms accounting; accounting errors cancel and fail closed. Supervisor requires 64 MiB free space before accepting an execution, bounds source/artifact/output/time/PIDs/memory, owns mode-0700 workspaces, and verifies deletion. Runtime workspace remains a 1 MiB kernel-sized tmpfs. Bounded file-size and multi-small-file fixtures, low-space unit injection, normal compile, post-limit recovery, and cleanup pass.

**Residual risk.** A compile job can briefly exceed the 32 MiB aggregate target by writes completed between monitor samples, up to other enforced per-file/process/time/resource bounds. Concurrent host capacity still needs operational admission sizing.

**Operational requirement.** Put workspace on dedicated local Linux storage, alert before free space falls near admission reserve, cap Worker concurrency, retain ownership/residue monitoring, and reject execution when preflight fails.

**Revisit trigger.** Native Linux qualification must test the target filesystem. Revisit project quota or size-limited per-job mount when concurrency grows, the workspace target increases, another compiler is added, overshoot is observed, or storage isolation changes.
