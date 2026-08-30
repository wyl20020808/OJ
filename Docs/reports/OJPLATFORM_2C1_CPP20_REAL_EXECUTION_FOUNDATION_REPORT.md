# OJPlatform Phase 2C.1 C++20 Real Execution Foundation Report

## Decision

**PHASE 2C.1 C++20 REAL EXECUTION FOUNDATION: PASS**

The qualified result is limited to controlled C++20 source snapshot
compilation and raw execution in the existing Phase 2B Sandbox boundary. It
does not implement or qualify an OJ verdict engine, output comparison,
testcase aggregation, scoring, additional languages, or production operation.
Phase 2C remains IN PROGRESS and Phase 2D is NOT STARTED.

## Provenance and Commits

- Repository: `D:\OJPlatform`
- Branch: `master`
- Starting HEAD and Phase 2B final baseline:
  `82431fcf38b2d898fa4ae12608235d39656737ad`
- Phase 2B baseline is an ancestor of the final history: PASS
- Implementation commit:
  `0c230dff8959f217779f0dd7f16549cbbb463b38`
- Closure commit: this report/PROJECT_STATUS commit; its resolved SHA is
  reported in the final response
- Final HEAD: the closure commit above
- Existing untracked user files were preserved and not committed

No reset, checkout, clean, rebase, force operation, branch switch, or history
rewrite was used.

## Qualified Topology

The formal qualified path is:

`Submission -> Judge Job -> Redis queue -> Go Worker -> loopback Supervisor -> compile runc -> verified artifact -> runtime runc -> raw result`

- API gate: `REAL_SUBMISSION_EXECUTION=true`
- Worker gate: `REAL_SUBMISSION_EXECUTION=true`
- Supervisor gate: `OJPLATFORM_REAL_EXECUTION_ENABLED=true`
- Default when gates are absent: submitted-source execution disabled
- Supervisor identity: dedicated `oj-sandbox`, host UID/GID `1000/1000`
- Execution backend: rootless runc with systemd cgroup v2
- Worker Application PostgreSQL access: none
- Host compiler/executable fallback: none

The API creates the immutable source snapshot from the existing Submission
intake object. The Worker receives it only through the Judge Job payload and
does not resolve a host path or query Application PostgreSQL.

## C++20 Profile and Compiler Rootfs

- Profile: `cpp20-gcc-13-v1`
- Compiler: `/usr/bin/g++-13` inside the compiler rootfs
- Compiler version: `g++-13 (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0`
- Rootfs: `/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1`
- Rootfs identity:
  `ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5`
- Fixed command-template SHA-256:
  `46c35896ef29839a0cb3b9728503c308526d5338ba9a5d5c83179611165876c6`
- Base OCI image: pinned Ubuntu 24.04 digest
- Preparation: official packages installed at image-build time, then exported
  offline with package, image, compiler, content, ownership, type and mode
  manifests
- Runtime jobs perform no package download or installation

The rootfs is root-owned and non-writable to the Supervisor. The Supervisor
preflight verifies its exact path, identity sidecar, compiler version, compiler
executable and complete non-writable tree before listening with real execution
enabled.

The fixed argv is:

```text
/usr/bin/g++-13 -std=c++20 -O2 -pipe -static -fno-diagnostics-color
-fno-ident /workspace/input/main.cpp -o /workspace/build/main
```

No shell, user compiler path, flag, linker flag, environment, mount or output
path is accepted.

## Source, Queue and Result Authority

Real Job payloads bind Submission ID, problem revision, testdata version,
language profile, source snapshot reference, UTF-8 source bytes, lowercase
SHA-256, fixed input ID and attempt. Source is limited to 256 KiB and the hash
is checked at API/Redis read, Worker/Supervisor client and Supervisor entry
boundaries.

The existing lease token and attempt remain authoritative. Go
`Queue.CompleteReal` unmarshals and binds protocol, execution request, Judge
Job, Submission, attempt, profile, source hash, pipeline outcome and compile
envelope before persistence. TypeScript performs the same validation whenever
a completed Redis payload is read. Stale, cross-job, cross-submission and
wrong-hash results are rejected and cannot overwrite the current terminal
state.

Supervisor idempotency records are capped at 1,024 and retained for 15 minutes,
which exceeds the current retry window. Capacity exhaustion fails closed.
Request deadlines are actual execution-context deadlines.

Public projections omit source bytes/reference, lease owner/token/expiry,
internal cgroup path and detailed resource evidence. Only bounded raw compile,
artifact and runtime fields are exposed to the authorized Submission owner.

## Compile Sandbox and Limits

Compilation runs in its own rootless-runc lifecycle with user, PID, mount,
network, IPC and UTS namespaces, dropped capabilities, `NoNewPrivileges`,
seccomp, cgroup v2, read-only compiler rootfs and one per-job workspace.

| Limit | Qualified value |
|---|---:|
| CPU quota | 100 ms / 100 ms |
| Wall time | 10,000 ms |
| Memory | 512 MiB |
| Pids | 64 |
| stdout | 65,536 bytes |
| stderr | 65,536 bytes |
| Workspace | 32 MiB |
| Artifact | 16 MiB |

Compiler output is byte-bounded, UTF-8 normalized and host/rootfs paths are
sanitized. Output limit cancellation is immediate. Source errors produce
`COMPILE_FAILED`; limit, cancellation and infrastructure states remain distinct
pipeline diagnostics and are not OJ verdicts.

## Artifact and Runtime Contract

The Supervisor accepts only the fresh fixed artifact path. It requires a
regular non-symlink executable, expected mapped owner, canonical in-workspace
path, size at most 16 MiB, static Linux ELF without `PT_INTERP`, and records its
SHA-256. The current successful formal pipeline artifact hash was
`bbd8fdd577b682072dcc28868f669ab4a432877fbddd9670d23c77d940041c96`.

Runtime uses a separate lifecycle ID, bundle, cgroup, timeout, buffers and
cleanup verification. The runtime rootfs contains only the copied approved
static executable and minimal mount points; it contains neither source nor
compiler. Network remains default-deny. Input is restricted to fixed
Supervisor-owned `stdin-empty-v1` and `stdin-echo-v1` fixtures.

| Limit | Qualified value |
|---|---:|
| CPU quota | 100 ms / 100 ms |
| Wall time | 2,000 ms |
| Memory | 64 MiB (`memory.max=67108864`) |
| Pids | 16 (`pids.max=16`) |
| stdout | 65,536 bytes |
| stderr | 65,536 bytes |
| Workspace tmpfs | 1 MiB |

Raw runtime data includes exit/signal where available, bounded stdout/stderr,
truncation flags, wall duration, resource events and cleanup state. A non-zero
exit remains `EXECUTION_COMPLETED`; it is not mapped to RE. Limit events are not
mapped to TLE, MLE or OLE.

## C2C-01 Through C2C-35

| ID | Evidence | Result |
|---|---|---|
| C2C-01 | Minimal source compiled with fixed GCC 13 profile | PASS |
| C2C-02 | Hello-world binary executed in the separate runtime Sandbox | PASS |
| C2C-03 | `stdin-echo-v1` returned `phase2c1-input` | PASS |
| C2C-04 | C++20 `consteval` fixture compiled and returned `42` | PASS |
| C2C-05 | Syntax error returned `PIPELINE_COMPILE_FAILED` / `COMPILE_FAILED` | PASS |
| C2C-06 | Missing-symbol linker error returned compile failure | PASS |
| C2C-07 | Diagnostic flood stopped at exactly 65,536 bytes | PASS |
| C2C-08 | Pathological compile reached the 10-second compile wall limit | PASS |
| C2C-09 | Compiler stress retained the 512 MiB compile memory boundary | PASS |
| C2C-10 | Exit code 7 remained raw `EXECUTION_COMPLETED`, not RE | PASS |
| C2C-11 | Infinite loop hit runtime wall protection, not a TLE verdict | PASS |
| C2C-12 | Memory pressure showed finite `memory.max` and memory events | PASS |
| C2C-13 | Child fanout showed `pids.max=16` and `pids.events max` | PASS |
| C2C-14 | stdout flood was capped and execution cancelled immediately | PASS |
| C2C-15 | stderr flood was capped and execution cancelled immediately | PASS |
| C2C-16 | Runtime `/etc`/filesystem escape fixture returned `DENIED` | PASS |
| C2C-17 | Runtime `/mnt/c` access returned `DENIED` | PASS |
| C2C-18 | Runtime `/mnt/d` access returned `DENIED` | PASS |
| C2C-19 | Runtime host project access returned `DENIED` | PASS |
| C2C-20 | Controlled external connection fixture returned `DENIED` | PASS |
| C2C-21 | Real source connect to host Supervisor `127.0.0.1:19092` returned `DENIED` | PASS |
| C2C-22 | Guest was PID 1; signal probe against host Supervisor PID returned `ESRCH/DENIED` | PASS |
| C2C-23 | Source hash mismatch was rejected with HTTP 400 before compile | PASS |
| C2C-24 | Canonical-path/symlink artifact tamper tests were rejected | PASS |
| C2C-25 | Artifact hash mismatch was rejected | PASS |
| C2C-26 | Unsupported language profile failed closed | PASS |
| C2C-27 | Strict request schema has no compiler flag field; unknown input is rejected | PASS |
| C2C-28 | Formal pipeline compile cancellation returned `COMPILE_CANCELLED`, clean=true | PASS |
| C2C-29 | Formal pipeline runtime cancellation returned `EXECUTION_CANCELLED`, clean=true | PASS |
| C2C-30 | Compile failure/limit/cancel paths left no source, bundle, cgroup or workspace | PASS |
| C2C-31 | Runtime exit/limit/cancel paths left no process, bundle, cgroup or workspace | PASS |
| C2C-32 | Two concurrent C++ executions used independent compile/run lifecycles | PASS |
| C2C-33 | Concurrent memory/pids jobs used distinct cgroups and both cleaned | PASS |
| C2C-34 | API and Worker log scans contained neither source marker nor credential marker | PASS |
| C2C-35 | Disabled Supervisor advertised no profile and returned HTTP 403 for execution | PASS |

## Formal Submission Pipeline Evidence

The latest post-hardening successful formal pipeline used:

- Submission: `25c06527-d5f8-4a20-9171-5132c4f62797`
- Judge Job: `cc516f32-bf49-4cb0-901a-8e99c65dd019`
- Attempt: 1
- Submission/Job status: `EXECUTION_COMPLETED` / `COMPLETED`
- Protocol: `2C.1`
- Pipeline: `PIPELINE_COMPLETED`
- Compile: `COMPILE_SUCCEEDED`, clean=true
- Runtime: `EXECUTION_COMPLETED`, clean=true
- stdout: `pipeline-recheck\n`
- Source SHA-256:
  `914c4007ee15254784d88e5705ce34e9ae34b5d255f5fc2444bafa5e2e59439e`
- Pipeline cleanup: true

A separate formal Submission/Job
`b7f913b1-c08c-437b-ac53-9dd455afbb1c` /
`76038614-c34f-449a-917c-88d39a6200bb` proved source compile failure was
persisted as `PIPELINE_COMPILE_FAILED`, with no runtime and cleanup=true.

Formal cancellation evidence:

- Compile cancellation: Submission
  `c06ce10a-5c55-43ed-a5d1-c35fff97c7c3`, Job
  `8b3b331a-1b10-4ae3-8c68-59fc90651da1`
- Runtime cancellation: Submission
  `1b0fd9d0-f0e6-4e60-8642-cfbe0d6757bf`, Job
  `cbcc4145-031a-4eac-bb58-03359a0af5e9`
- Both API states: `CANCELLED`
- Both Supervisor pipelines: `PIPELINE_CANCELLED`, cleanup=true

Public responses contained no source snapshot, lease metadata or cgroup path.

## Phase 2B Security Regression

The current Phase 2B final matrix's 11 bounded real named groups were rerun as
the dedicated non-root user and all passed in 47.361 seconds:

- non-root preflight and backend availability
- CPU and workspace enforcement
- Supervisor memory/pids enforcement
- cancellation under pressure
- repeated pressure/cancellation
- three direct pressure cycles
- concurrent Supervisor and direct memory/pids isolation

Observed evidence included `cpu.max=10000 100000`, finite 32/64 MiB
`memory.max`, `pids.max=16`, memory `max` events, pids `max` events, distinct
concurrent cgroups and clean cancellation. UID0/missing D-Bus/missing runc
paths remained fail-closed. The historical broad `TestReal*` aggregate was not
rerun and is not used as a gate.

## Automated Quality Gates

| Gate | Result |
|---|---|
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS - 318 passed, 3 skipped |
| `pnpm test:architecture` | PASS |
| `pnpm build` | PASS |
| `pnpm integration` | PASS - 4/4 |
| Judge Worker `go test ./...` | PASS |
| Judge Worker `go vet ./...` | PASS |
| Supervisor `go test ./...` | PASS |
| Supervisor `go vet ./...` | PASS |
| Phase 2B real named groups | PASS - 11 groups |
| `git diff --check` | PASS |
| Staged secret scan | PASS |

## Source, Log and Secret Review

API and Worker session output was scanned after successful, compile-failure,
compile-cancel and runtime-cancel formal pipelines. Neither the controlled
source marker nor qualification password marker appeared. Supervisor emits no
source or compiler diagnostics to its process log. Public projection removes
source bytes, lease data and internal resource paths. No credential or secret
was added to the staged implementation.

Compiler diagnostics remain bounded result data. The Worker source tree has no
Application PostgreSQL URL, driver or query path.

## Cleanup and Residue Audit

Every current 2C.1 compile/runtime path reported cleanup=true where required.
After all Goal processes stopped, audit found no current `c2c1-*` or
`phase2b-sbx-*` process, runc container, cgroup, mount, network namespace,
source, artifact, bundle or workspace.

The final audit did discover four older `runc-r34-pressure-*` Phase 2B
diagnostic scopes with `/probe` processes that had survived for 8-9 hours.
They predated current 2C.1 executions and contradicted the older residue
summary, so they were not ignored. Their exact transient units were inspected,
stopped, and re-audited. All five orphan PIDs, four scopes, associated mounts,
temporary paths and runc state are now absent. The fresh Phase 2B named-group
rerun itself left no residue.

The trusted compiler rootfs under `/opt/ojplatform/compiler-rootfs` is a
versioned, read-only qualification asset and is intentionally retained. Goal
API, Worker and Supervisor processes are stopped. Development infrastructure
is stopped without deleting its named data volumes.

## Limits and Deferred Work

This Goal qualifies one static C++20 compiler/runtime profile in the tested
development WSL environment. It does not qualify production HA, host/WSL hard
crash recovery, multi-machine execution, disaster recovery, production
deployment, dynamic binaries, multiple languages, testcase data delivery,
expected-output comparison, checker/special judge, scoring or verdicts.

`CODE EXISTS`: yes. `FEATURE IMPLEMENTED`: yes. `FEATURE TESTED`: yes.
`FEATURE RUNTIME QUALIFIED`: yes, for Phase 2C.1 qualification-only C++20
execution. `PRODUCTION READY`: no.

## Final State

- Phase 2B: PASS / CLOSED
- Phase 2C: IN PROGRESS / C++20 real execution foundation qualified
- Real C++20 execution: QUALIFICATION ONLY
- Verdict engine: NOT STARTED
- Phase 2D: NOT STARTED
- Ready for the next Phase 2C Goal: YES

**C++20 REAL COMPILER/RUNTIME EXECUTION FOUNDATION QUALIFIED.**
