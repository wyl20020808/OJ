# OJPlatform Phase 2B-R1 Sandbox Host Compatibility Recovery Report

Goal: `PHASE 2B-R1 — SANDBOX HOST COMPATIBILITY & RUNC ISOLATION RECOVERY`  
Date: 2026-08-29  
Status: **PASS FOR MINIMAL RECOVERY; FULL SANDBOX QUALIFICATION PENDING**

## Starting State and Blocker

Lead started at `5d5fc2edb9b5b5f427c74c61c7fb904e4da8c235` on `master`; Phase 2B was `IN PROGRESS / BOOTSTRAPPED`. Runtime branch `codex/phase2b-sandbox-runtime` started at `0fb49612725c7a1b9c0a3c83f39f2b83d8714cbf`. Its exact runc test failed during rootfs preparation with `remount-private ... MS_PRIVATE: permission denied` when user/mount namespaces and UID/GID mappings were enabled, on both native WSL `/tmp` and Windows-mounted storage.

## Diagnostic Matrix

| Diagnostic | Expected | Actual | Security implication |
|---|---|---|---|
| WSL version/distro | WSL2 Ubuntu supported | Ubuntu 24.04, WSL2 | Linux backend is available |
| Kernel | namespace/cgroup-capable Linux | `6.18.33.2-microsoft-standard-WSL2` | Behavior must be qualified, not assumed |
| systemd | usable service environment | `running` | cgroup management available |
| mount propagation | propagation understood | `/`, `/mnt/c`, `/mnt/d` are `private`; host mounts are writable 9p | Never expose host mounts to Guest |
| user namespace | mapped user possible | `unshare --user --map-root-user` succeeds; sysctl is absent | Userns is not the root cause |
| combined user+mount | mount isolation possible | combined unshare plus `mount --make-rprivate /` succeeds | WSL permits the primitive |
| UID/GID mapping | mapped identity can traverse bundle | `0 -> 65534` works with traversable parent | Supervisor directory mode is security-relevant |
| subuid helpers | broad mappings available | `/etc/subuid` and `/etc/subgid` empty; helpers absent | Single explicit mapping avoids helper dependency |
| cgroup v2 | resource controls available | `cgroup2fs`; CPU, memory, pids, io controllers present | Primitive available; full enforcement pending |
| seccomp | filtering available | host mode 2; Docker/runc builtin seccomp support | Explicit profile required |
| Docker/OCI | runc available | Docker Engine 29.7.2, runc 1.4.3 | Candidate runtime available |
| exact bundle before fix | trusted probe starts/cleans | `MS_PRIVATE` permission failure | Bundle preparation defect |
| exact bundle after fix | trusted probe starts/cleans | passes native `/tmp` and `/mnt/d` diagnostic roots | Minimal recovery qualified |

## Root Cause

The Supervisor created a `0700` temporary root while mapping Guest UID/GID 0 to host ID 65534. The mapped runc init process could not traverse the private parent. Required `/dev`, `/proc`, and `/tmp` mountpoints were also absent while capabilities were empty. runc reported the first failure at rootfs private-remount, obscuring the underlying path/mount preparation problem. WSL2 itself supports the combined user and mount namespace primitives.

## Recovery Changes

Runtime commit `9496095`:

- make the Supervisor root `0711` (traversable, not listable) for the mapped identity;
- pre-create `/dev`, `/proc`, and `/tmp` mountpoints;
- explicitly mount `/dev` as a small `nosuid,nodev,noexec` tmpfs;
- remove the bundle directory before checking `Clean`, while retaining deferred cleanup for early failures;
- parameterize the real trusted-probe test root for native and mounted diagnostics.

No namespace, seccomp, cgroup, capability, network or no-new-privileges control was disabled.

## Minimal Qualification Evidence

`OJPLATFORM_SANDBOX_REAL_TEST=true go test ./internal/supervisor -run TestRealRuncTrustedProbeIsolation -v` passed on native WSL `/tmp` and on a `/mnt/d` diagnostic root. The fixed repository-owned probe reported `/mnt/c`, `/mnt/d`, `/host`, and traversal paths absent, wrote only its workspace marker, ran as PID 1 in the isolated PID namespace, and cleanup verification passed. Runtime `go test ./...` and `go vet ./...` passed.

## Rootless and Privileged Supervisor Assessment

Conclusion: **RUNC ROOTLESS RECOVERABLE**. A privileged Supervisor is not required for this recovered minimal path. The Supervisor remains trusted infrastructure and must retain empty capabilities, no-new-privileges, user/mount/PID/network namespaces, cgroup limits, explicit seccomp, minimal filesystem, no `/mnt/c` or Docker socket, and verified teardown. A future privileged Supervisor, if ever needed, requires separate high-risk review and proof that the Guest remains an unprivileged mapped identity.

## Required Follow-up

Runtime Worker must requalify the full FS/NET/PS/RL/ENV/LC/WI matrix, including cgroup delegation, network denial, syscall probes, concurrency, and failure injection. Lead Integration remains intentionally not started.

## Final State

`READY TO RESUME RUNTIME WORKER = YES`  
`READY FOR PHASE 2B LEAD INTEGRATION = NO`

Final Lead HEAD and Git status are recorded by the closing commit.

