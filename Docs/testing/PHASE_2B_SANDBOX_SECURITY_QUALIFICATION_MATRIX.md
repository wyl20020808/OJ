# PHASE 2B Sandbox Security Qualification Matrix

Final status: **PASS**. Scope is the frozen trusted-probe-only Phase 2B
contract. Real Submission execution and verdict production remain disabled.

Evidence path for integrated rows:

`real operator API -> loopback Supervisor protocol 2B.1 -> oj-sandbox -> rootless runc`

| IDs | Setup | Actual evidence | Result |
|---|---|---|---|
| SB01-SB06 | Contract, registry, malformed requests | Fixed server catalog/version/hash/policy; exact server-computed hash; loopback and HTTP method enforcement; unknown probe, forged hash, arbitrary payload and `REAL_SUBMISSION_EXECUTION` rejected | PASS |
| FS-INT-01..13 | Full isolation trusted probe | Assigned workspace allowed; host root, project, `.git`, home, synthetic credentials, `/mnt/c`, `/mnt/d`, other workspace, traversal, symlink escape and outside write denied; workspace removed | PASS |
| NET-INT-01..10 | Controlled known endpoints only | TEST-NET external address, WSL/private gateway representative, Windows host-local, API, PostgreSQL, Redis, MinIO and DNS denied; no default route; loopback bind allowed by frozen policy; no stale namespace | PASS |
| PROC-INT-01..12 | PID/user/mount/network namespaces, capabilities and seccomp | Guest PID 1 with one visible PID; host process control and signals denied; mount, unshare, ptrace and ptrace attach denied; `CapEff=0`, `NoNewPrivileges=1`, `Seccomp=2`; device boundary and pids enforcement active; Supervisor survived | PASS |
| RESOURCE-INT-01..11 | CPU, timeout, memory, pids, output, workspace, cancellation and concurrency probes | `cpu.max=10000 100000`, `nr_throttled=101`; memory requested/OCI/`MemoryMax`/`memory.max=33554432`, `memory.events max=235`; pids requested/OCI/`TasksMax`/`pids.max=16`, `pids.events max=101`; independent 64 MiB/8 and 32 MiB/16 pairs; bounded output/workspace/wall time and cleanup | PASS |
| LC-INT-01..16 | Success, timeout, cancel, pressure, fanout, setup/child failure, repeated and concurrent jobs | Explicit outcomes; cancellation returned `SANDBOX_CANCELLED` and `clean=true`; abnormal child exit failed closed; repeated/concurrent named groups passed; no orphan runc, scope, cgroup, mount, netns or workspace | PASS |
| CLEANUP-FAILURE | Qualification-only fixed fault and recovery | Fixed Supervisor-owned sentinel only; `SANDBOX_CLEANUP_FAILURE`, `clean=false`, `qualification_pass=false`; API/Web showed cleanup failure; verify stayed failed; recovery returned PENDING; fresh full probe required for PASS | PASS |
| CRASH-INT-01..05 | Child exit, cancel, controlled abnormal termination, Supervisor/API reconnect, stale client state | No false success; authoritative server state won; idle Supervisor loss degraded a prior PASS to PENDING; reconnect and API restart remained PENDING; active loss is fail-closed with cleanup uncertain | PASS |
| ENV01-ENV08 | Minimal environment and safe evidence projection | Application DB/Redis/object-store/session credentials absent; raw paths, command, environment and internal runtime data excluded from public projection; no source or secret logging | PASS |
| WI01-WI06 | Worker/Sandbox architecture boundary | Trusted-probe-only protocol; no source/command/executable/path/target input; Sandbox has no Application PostgreSQL access; real mode disabled; result-only projection | PASS |
| AUTHZ | Anonymous, ordinary user and operator | Server-side identity; anonymous 401, ordinary user 403, operator allowed; no client-supplied operator trust | PASS |
| J2B | Browser journeys | Historical two independent runs: 12/12; final focused run: 6/6 including cleanup fault/recovery, ordinary-user denial, refresh during cancellation, 390px and clean journey console | PASS |
| REGRESSION | Repository quality and product journeys | Format, lint, typecheck, 313 tests/3 skipped, architecture, build, API integration 4/4, Go test/vet, critical product Playwright 5/5 | PASS |
| RESIDUE | Final stopped-state audit | API, Web, Supervisor and Goal Compose infra stopped; no guest/runc/scope/cgroup/mount/netns/workspace/temp artifact | PASS |

## Bounded TestReal Reconciliation

Current required named groups all passed with
`OJPLATFORM_SANDBOX_REAL_TEST=true`, `CGO_ENABLED=0`, and
`GOFLAGS=-buildvcs=false`:

- `TestRealR4NonRootPreflightContract`
- `TestRealR4SB01BackendAvailable`
- `TestRealR4SupervisorCPUConstraint`
- `TestRealR4WorkspaceGrowthLimit`
- `TestRealR4SupervisorResourceQualification`
- `TestRealR34NonRootKernelEnforcement`
- `TestRealR4SupervisorCancellationUnderPressure`
- `TestRealR4RepeatedSupervisorPressureAndCancellation`
- `TestRealR34NonRootThreePressureCycles`
- `TestRealR4ConcurrentResourceIsolationCycles`
- `TestRealR34NonRootConcurrentLimits`

The historical broad `TestReal*` aggregate remains preserved and classified
**SUPERSEDED DIAGNOSTIC / NOT REQUIRED AS ONE FINAL GATE**. Its silent timeout
and interference are not represented as a PASS. Historical R1/R2/R3
experiments remain useful diagnostics but are not current Phase 2B hard gates.

## Boundary

This matrix does not qualify arbitrary submitted-source compilation or
execution, verdict generation, production HA, host/WSL crash recovery,
multi-machine failover, or disaster recovery. Abrupt Supervisor loss during an
active probe fails closed and requires cleanup recovery; it is not reported as
qualified.
