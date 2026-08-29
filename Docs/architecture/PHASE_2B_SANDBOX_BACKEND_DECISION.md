# PHASE 2B Sandbox Backend Decision

Status: selected production-intent architecture; NOT QUALIFIED.

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

No backend is currently qualified. Docker/runc availability demonstrates capability only. A future implementation must prove every matrix row with trusted probes, including hostile-path and WSL `/mnt/c` denial, network denial, syscall/process isolation, limits, and cleanup. No unsandboxed fallback is permitted.

