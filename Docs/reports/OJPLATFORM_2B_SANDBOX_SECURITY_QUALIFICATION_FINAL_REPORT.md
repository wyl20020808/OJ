# OJPlatform Phase 2B Sandbox Security Qualification Final Report

## Decision

**PHASE 2B SANDBOX SECURITY QUALIFICATION: PASS**

**READY FOR PHASE 2C: YES**

This decision is limited to the frozen trusted-probe-only Phase 2B contract.
It is not a production-readiness claim and does not enable submitted-source
execution, compilation, interpretation, verdict generation, or Contest work.
Phase 2C has not started.

## Provenance and Commits

- Branch: `master`
- Starting Lead HEAD: `c5e81f09afe2ec2110777b82a62437b250dc8a08`
- Auth/Security tip integrated: `94ca8aa60c328661fe33ca0e7cb1a1c9a8181617`
- Runtime R4 tip integrated: `c8490508c0d38a5fea63f803b57a470dc5d11277`
- Web tip integrated: `4fc3ea414fa9085a16883e782ae52cf8ba7a6713`
- Lead integration checkpoint: `63817846b227fd9090973665497aebca3fd10b8f`
  (`feat: integrate phase 2B sandbox control plane`)
- Qualification code/test commit: `e9f45e3`
  (`test: complete phase 2B final sandbox qualification`)
- Historical accidental `d986582`: not in Lead ancestry

R1-R4 reports and their blocker history remain in repository history. This
closure does not rewrite those partial results. Pre-existing untracked files
were preserved.

## Final Topology and Identity

The qualified path was:

`Web/operator -> real API/Authz -> HTTP 2B.1 on loopback -> dedicated non-root Supervisor -> rootless OCI/runc -> fixed trusted probe`

- Supervisor host identity: UID/GID `1000/1000` (`oj-sandbox`)
- Guest identity: UID/GID `0/0`, mapped to host UID/GID `1000/1000`
- Supervisor execution: systemd user manager and cgroup v2
- Probe artifact: exact server-computed SHA-256 and static Linux ELF; dynamic
  `PT_INTERP` artifacts are rejected before runc
- Protocol input: fixed probe ID/version/hash and correlation ID only
- Prohibited input: source, command, executable path, mount, environment,
  network target, Submission payload and real-execution mode

The API resolves operator identity server-side. Anonymous requests return 401,
ordinary authenticated users return 403, and the API never trusts a
client-supplied owner or operator identifier.

## Integrated Isolation Matrix

### Filesystem

FS-INT-01 through FS-INT-13 passed over the full integrated path. The assigned
workspace was usable. Host root, `D:\OJPlatform`, `.git`, host home, controlled
credential locations, `/mnt/c`, `/mnt/d`, another workspace, traversal,
symlink escape and outside writes were denied. The workspace was removed after
the run.

### Network

NET-INT-01 through NET-INT-10 passed using controlled known endpoints only.
The external TEST-NET address, private/WSL gateway representative, Windows
host-local service, OJ API, PostgreSQL, Redis, MinIO and DNS were denied. There
was no default route. Loopback bind/listen was allowed by the frozen policy.
No scanning was performed and no network namespace remained.

### Process, Privilege and Seccomp

PROC-INT-01 through PROC-INT-12 passed. Evidence recorded guest PID `1`, one
visible PID, `CapEff=0000000000000000`, `NoNewPrivileges=1`, and `Seccomp=2`.
Host process enumeration/control, unrelated signal, mount, namespace
escalation, ptrace and ptrace attach were denied. The OCI configuration places
seccomp at `linux.seccomp`; a regression assertion prevents the earlier
incorrect `process.seccomp` serialization. The Supervisor survived guest
termination and resource pressure.

## Integrated Resource Matrix

RESOURCE-INT-01 through RESOURCE-INT-11 passed.

| Resource | Final kernel evidence |
|---|---|
| CPU | `cpu.max=10000 100000`; `nr_throttled=101` |
| Memory | requested = OCI = `MemoryMax` = `memory.max=33554432`; `memory.events max=235` |
| Pids | requested = OCI = `TasksMax` = `pids.max=16`; `pids.events max=101` |
| Concurrency | independent pairs `(64 MiB, pids 8)` and `(32 MiB, pids 16)` |

Wall timeout, bounded stdout/stderr, workspace growth, memory-pressure cleanup,
pids-pressure cleanup, cancellation under pressure and Supervisor survival
also passed. Neither status 137 nor an RSS watcher was used as a substitute for
kernel evidence.

## Lifecycle, Cleanup and Crash

LC-INT-01 through LC-INT-16 passed across normal success, timeout, cancel,
memory and pids pressure, fanout, setup failure, abnormal child exit,
concurrent cleanup and repeated clean starts. Final inspection found no orphan
guest/runc process, stale systemd scope, cgroup, mount, network namespace or
workspace.

The qualification-only cleanup fault is enabled only with
`OJPLATFORM_SANDBOX_QUALIFICATION_FAULTS=true` and can create only the fixed
Supervisor-owned `.qualification-cleanup-failure` sentinel. It accepts no path
or command input.

- Cleanup failure detected: PASS (`SANDBOX_CLEANUP_FAILURE`, `clean=false`)
- False success prevention: PASS (`qualification_pass=false`; API/Web FAIL)
- Verify while faulted: remained failed
- Recovery cleanup: PASS and returned qualification to PENDING
- Fresh full probe after recovery: required and passed

CRASH-INT-01 through CRASH-INT-05 passed within the current contract:
unexpected child exit, active cancellation, Supervisor-controlled abnormal
termination, idle Supervisor stop/reconnect, API restart, and refreshed-client
authority. A prior qualified API degraded to PENDING when the idle Supervisor
stopped; reconnect and API restart returned IMPLEMENTED/PENDING and never
restored PASS automatically. Supervisor loss during an active probe is marked
cleanup-uncertain/FAILED and requires recovery.

Host or WSL hard-crash cleanup, machine reboot recovery and production HA are
not supported by the current contract. They fail closed as unqualified and are
not described as tested cleanup guarantees.

## TestReal Reconciliation

The current required bounded groups passed:

- non-root preflight and SB01 backend availability
- CPU and workspace constraints
- kernel memory/pids enforcement
- cancellation and repeated pressure
- three pressure cycles
- concurrent independent limits

Exact test names are recorded in the Phase 2B matrix. The first SB01 attempt
was blocked only by Go VCS stamping reading `.git` as `oj-sandbox`; it passed
unchanged with `GOFLAGS=-buildvcs=false`. Repository permissions were not
weakened.

The historical broad `TestReal*` aggregate had long silent execution,
interference and a bounded timeout. It is preserved and classified
**SUPERSEDED DIAGNOSTIC / NOT REQUIRED AS A SINGLE FINAL GATE**. No broad
aggregate PASS is claimed. Historical R1/R2/R3 experiments are not current
hard gates.

## Browser and Product Evidence

- Historical J2B evidence: two independent runs, 12/12 PASS
- Final J2B focused run: 6/6 PASS
- Final journeys: operator overview/full qualification, cleanup failure and
  recovery, ordinary-user denial, page refresh during active cancellation,
  390px layout, and clean journey console
- Cancellation result: `SANDBOX_CANCELLED`, `clean=true`, no false qualified
  transition
- Critical product Playwright: 5/5 PASS across platform, registration/login,
  Problem Detail, authoring, Submission intake/history/detail, Profile and
  logout

The Phase 1C `Status PENDING` literal was a stale assertion. It now verifies a
legal early lifecycle state (PENDING, QUEUED, LEASED/claimed/accepted, or
RUNNING) while retaining immutable revision/testdata/source assertions. The
real Phase 1C journey passed; this was not classified as a product regression.

## Full Regression

| Gate | Result |
|---|---|
| `pnpm format:check` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS - 313 passed, 3 skipped |
| `pnpm test:architecture` | PASS |
| `pnpm build` | PASS |
| API integration | PASS - 4/4 |
| WSL `CGO_ENABLED=0 GOFLAGS=-buildvcs=false go test ./...` | PASS |
| WSL `CGO_ENABLED=0 GOFLAGS=-buildvcs=false go vet ./...` | PASS |
| J2B final focused Playwright | PASS - 6/6 |
| Critical product Playwright | PASS - 5/5 |
| `git diff --check` | PASS |

The integrated qualification harness also returned `status: PASS` and captured
the evidence values in this report. No submitted source was compiled, executed,
evaluated, imported or used to launch a compiler/interpreter. Sandbox and Judge
Worker did not access Application PostgreSQL directly.

## Final Residue Audit

API, Web, Supervisor and Goal-owned PostgreSQL/Redis/MinIO Compose services were
stopped. No sandbox runc/guest, systemd scope, cgroup, mount, network namespace,
workspace or qualification temp artifact remained. The exact
`/tmp/ojplatform-phase2b-final` test tree was removed after its resolved path
was verified. Permanent reports and test evidence were retained.

## Security Limits and Phase 2C Boundary

This PASS qualifies rootless runc, namespaces, seccomp, cgroup v2 limits,
trusted probes, cleanup behavior, control-plane Authz and browser projection in
the tested development runtime. It does not qualify production HA,
multi-machine failover, disaster recovery, arbitrary language runtimes,
submitted-source execution, real verdicts or production deployment.

`CODE EXISTS`: yes. `FEATURE IMPLEMENTED`: yes. `FEATURE TESTED`: yes.
`FEATURE RUNTIME QUALIFIED`: yes, for Phase 2B trusted-probe scope.
`PRODUCTION READY`: no.

**PHASE 2B: PASS. PHASE 2C: NOT STARTED. READY FOR PHASE 2C: YES.**
