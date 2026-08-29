# PHASE 2B Sandbox Backend Decision

Status: selected production-intent architecture; rootless runc recovery qualified for the minimal trusted probe, full Sandbox qualification remains pending.

## Environment Evidence

- Windows 10 x64 host with WSL2 and Ubuntu 24.04.
- Linux kernel `6.18.33.2-microsoft-standard-WSL2`.
- cgroup v2 mounted; CPU, memory, pids, io and related controllers are present.
- User, mount and PID namespace creation probes returned success in the current privileged WSL shell.
- The process reports seccomp mode 2. Docker Engine `29.7.2` exposes runc, cgroup v2, builtin seccomp and cgroup namespace support.
- AppArmor is enabled in Docker's reported security options; Landlock availability was not established.
- `/mnt/c` is a writable 9p mount and is not an acceptable guest mount.

## Decision

Use a dedicated Sandbox Supervisor using OCI/runc as the isolation primitive, with an explicit per-job root filesystem, user/mount/PID/network namespaces, cgroup v2 limits, a reviewed seccomp profile, dropped capabilities, no devices, no host networking, read-only runtime assets, and a private writable workspace. The Worker talks to a typed Supervisor contract; it does not call Docker or the application database directly.

This is preferable to timeout-only, chroot-only, default-container-only, nsjail-only, or ordinary-process approaches because it provides composable filesystem, process, network, syscall and resource controls while retaining future language-image compatibility. nsjail/bubblewrap remain alternatives to evaluate if the Supervisor cannot obtain reliable OCI controls.

## Qualification Boundary

The initial Runtime Worker failure was caused by bundle preparation: the Supervisor root was mode `0700` while guest UID/GID `0` mapped to host `65534`, and required `/dev`, `/proc`, and `/tmp` mountpoints were absent. runc surfaced this as `remount-private ... MS_PRIVATE: permission denied`. The recovery requires a Supervisor-owned root traversable by the mapped identity without listing (`0711`), pre-created mountpoints, explicit `/dev` tmpfs, and cleanup before verification.

With those exact changes, runc 1.4.3 successfully started the fixed trusted probe with user/mount/PID/network namespaces, UID/GID mapping `0 -> 65534`, dropped capabilities, no-new-privileges, seccomp policy, cgroup resources, and no host mounts. Native WSL and a `/mnt/d` diagnostic root both passed the minimal probe. This is recovery evidence only; FS/NET/PS/RL/ENV/LC full qualification remains pending and no unsandboxed fallback is permitted.
