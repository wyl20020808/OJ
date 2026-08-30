# Phase 2C.1 C++20 Real Execution Contract

Status: FROZEN for Phase 2C.1 qualification. Protocol version: `2C.1`.

This contract introduces controlled compilation and raw execution of an
immutable C++20 Submission snapshot. It does not introduce testcase judging or
an OJ verdict.

## Feature Gate

`REAL_SUBMISSION_EXECUTION` is disabled unless the API, Judge Worker, and
Sandbox Supervisor are each started with the server-controlled qualification
gate enabled. No request field or Web client can enable it. A missing or failed
preflight rejects real execution; there is no fallback to a host compiler,
host executable, UID0 Supervisor, or weaker Sandbox.

Safe-fixture and trusted-probe behavior remains the default when the gate is
disabled.

## Immutable Execution Request

The Coordinator places the following internal fields on the existing Judge Job
message. They are never taken from a Worker host path:

| Field | Trust and validation |
|---|---|
| `protocol_version` | exact `2C.1` |
| `execution_request_id` | Coordinator-owned, stable for `job id + attempt` |
| `judge_job_id`, `submission_id`, `attempt`, `correlation_id` | existing queue/lease authority |
| `problem_revision_id`, `testdata_version_ref` | immutable Submission linkage |
| `language_profile_id` | exact `cpp20-gcc-13-v1` |
| `source_snapshot_ref` | opaque Coordinator-owned reference |
| `source_bytes` | immutable UTF-8 Submission snapshot, maximum 256 KiB |
| `source_sha256` | lowercase SHA-256 of the exact UTF-8 bytes |
| `controlled_input_id` | fixed Supervisor registry entry only |
| `deadline_at`, `cancellation_generation` | queue/Worker control metadata |

Unknown fields are rejected. There is no source path, executable path,
compiler path, compiler flag, linker flag, shell command, environment, mount,
network target, output path, or syscall-policy input.

The Worker has no Application PostgreSQL credential and does not resolve the
snapshot itself. The API/Coordinator copies the already-created immutable
Submission snapshot into the existing Redis Judge Job payload. Public job and
Submission projections omit the source snapshot and lease metadata.

## Fixed Language Profile

Profile ID: `cpp20-gcc-13-v1`.

Compiler: `/usr/bin/g++-13` inside the trusted compiler rootfs.

Fixed argv:

```text
/usr/bin/g++-13
-std=c++20
-O2
-pipe
-static
-fno-diagnostics-color
-fno-ident
/workspace/input/main.cpp
-o
/workspace/build/main
```

The command is passed as an argv vector directly to runc. No shell is present
in the execution path. The command-template identity is SHA-256 over the
NUL-separated argv vector and is included in results and preflight evidence.

## Trusted Compiler Rootfs

The compiler filesystem is prepared before execution from the pinned official
Ubuntu 24.04 OCI image and fixed Ubuntu package versions. Preparation exports
an offline rootfs, package manifest, compiler version, OCI image identity, and
a content-manifest SHA-256. Jobs never run `apt`, download packages, or access
the network.

The rootfs is root-owned and read-only to the Supervisor. It is the OCI root,
not a bind mount of WSL `/`. The per-job workspace is the only writable bind
mount. `/mnt/c`, `/mnt/d`, the repository, homes, credentials, sockets, and
other workspaces are absent.

## Compile Sandbox

Compilation runs under the dedicated non-root `oj-sandbox` Supervisor using
rootless runc, a user namespace, PID/mount/network/IPC/UTS namespaces, dropped
capabilities, `NoNewPrivileges`, seccomp, and cgroup v2.

Fixed compile limits:

| Limit | Value |
|---|---:|
| CPU quota | 100 ms per 100 ms period |
| wall time | 10,000 ms |
| memory | 512 MiB |
| pids | 64 |
| stdout | 64 KiB |
| stderr | 64 KiB |
| workspace | 32 MiB |
| artifact | 16 MiB |

The Supervisor stages source only as `/workspace/input/main.cpp`. Compile
diagnostics are byte-bounded, converted to valid UTF-8, and sanitized so
trusted host/rootfs paths cannot appear. Resource and cancellation outcomes are
pipeline diagnostics, never CE/TLE/MLE/OLE verdicts.

Compile outcomes are `COMPILE_SUCCEEDED`, `COMPILE_FAILED`,
`COMPILE_LIMIT_EXCEEDED`, `COMPILE_CANCELLED`, and `COMPILE_INFRA_FAILURE`.

## Artifact Contract

After a successful compiler exit the Supervisor requires
`/workspace/build/main` to be a regular, non-symlink file under the canonical
per-job build directory, owned by the mapped Supervisor identity, no larger
than 16 MiB, executable, and a statically linked Linux ELF executable without
`PT_INTERP`. It records SHA-256, size, profile version, source SHA-256, and
command-template identity.

The runtime request cannot select an artifact path. Only this freshly verified
artifact is copied into the separate runtime bundle.

## Compile/Run Separation

Compile and runtime are independent runc lifecycle IDs, bundles, cgroups,
workspaces, timeouts, output buffers, cancellation points, and cleanup checks.
The compiler container exits before artifact verification and runtime bundle
creation. The runtime rootfs contains only the approved static executable and
minimal mount points; source and compiler files are absent.

## Runtime Sandbox and Input

The runtime retains the qualified Phase 2B identity, namespace, seccomp,
capability, filesystem, network, cgroup, timeout, output, and cleanup controls.
Network remains default-deny. Phase 2C.1 accepts only fixed Supervisor-owned
stdin fixtures: `stdin-empty-v1` and `stdin-echo-v1`.

Fixed runtime limits:

| Limit | Value |
|---|---:|
| CPU quota | 100 ms per 100 ms period |
| wall time | 2,000 ms |
| memory | 64 MiB |
| pids | 16 |
| stdout | 64 KiB |
| stderr | 64 KiB |
| workspace | 1 MiB tmpfs |

Runtime outcomes are `EXECUTION_COMPLETED`, `EXECUTION_LIMIT_HIT`,
`EXECUTION_CANCELLED`, and `EXECUTION_INFRA_FAILURE`. The raw result may contain
exit code, termination signal when reliably available, bounded stdout/stderr,
truncation flags, wall duration, resource events, and lifecycle/cleanup state.
It must not contain AC, WA, TLE, MLE, OLE, RE, CE, score, checker, expected
output, or testcase aggregation.

## Queue, Retry, Cancellation, and Result Authority

Real jobs use the existing Submission -> Judge Job -> Redis queue -> Go Worker
path. The existing lease token and attempt remain authoritative. The stable
execution request identity makes retries idempotent at the Supervisor. Only a
current lease may persist one raw result; stale or duplicate delivery cannot
overwrite the authoritative terminal state.

Supervisor idempotency state is bounded to 1,024 request records. Completed
records are retained for 15 minutes, which exceeds the current lease/retry
window, and then pruned. Capacity exhaustion fails closed instead of dropping
an active/recent identity or executing outside the Sandbox. The request
deadline is also the actual execution-context deadline, not only an entry-time
validation field.

Cancellation is observed by the Worker and forwarded to the Supervisor. It
cancels either the compile or runtime context, force-deletes the active runc
container, and verifies removal of the process, scope, cgroup, mount,
namespace, temporary source, artifact, and workspace. Cancellation cannot be
stored as success.

## Logging and Public Projection

API, Worker, Supervisor, runc, and audit logs must not contain source bytes,
lease tokens, credentials, environment secrets, or internal host paths. Public
projection exposes only the bounded raw execution result and immutable public
linkage. Compiler diagnostics are result data, not log data.

## Explicit Non-Goals

Phase 2C.1 does not perform expected-output comparison, checker invocation,
special/interactive judging, scoring, testcase aggregation, verdict mapping,
multi-testcase execution, or any language other than the fixed C++20 profile.
The compiler rootfs is a Phase 2C.1 qualification asset, not a production-ready
multi-language Judge image.
