# OJPlatform Phase 2C.2 Real Execution Lifecycle, Integrity & Reliability

## Decision

**PHASE 2C.2 REAL EXECUTION LIFECYCLE / INTEGRITY / RELIABILITY: PASS**

This qualification covers the frozen C++20 profile `cpp20-gcc-13-v1` in the
existing Phase 2B boundary. It proves reliable raw execution lifecycle
behavior. It does not implement verdict mapping, output comparison, checker,
scoring, testcase aggregation, other languages, or production readiness.

## Provenance

- Repository: `D:\OJPlatform`; branch: `master`
- Starting HEAD: `0f63c3305de96d0ba2816d8952767df679b3662a`
- Phase 2C.1 implementation baseline: `0c230dff8959f217779f0dd7f16549cbbb463b38`
- Phase 2C.1 closure baseline: `0f63c3305de96d0ba2816d8952767df679b3662a`
- Implementation commit: `74a9566` (`feat: harden phase 2C.2 execution lifecycle`)
- Qualification commits: `26cc692` (`test: qualify phase 2C.2 worker crash recovery`),
  `9e17d7e` (`test: cover runtime worker crash recovery`)
- Closure commit: this report/status commit
- No reset, checkout, clean, rebase, force operation, or history rewrite was used.
- Pre-existing untracked user files were preserved.

## Baseline and Topology

The qualified path remains:

`immutable Submission snapshot -> Judge Job -> Redis queue -> Go Worker -> loopback Supervisor -> compile rootless-runc -> verified artifact -> runtime rootless-runc -> raw execution result`

The only enabled real profile is C++20 GCC 13.3.0 in the frozen compiler
rootfs `/opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1` with identity
`ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5` and fixed
argv template SHA `46c35896ef29839a0cb3b9728503c308526d5338ba9a5d5c83179611165876c6`.
The Supervisor ran as dedicated `oj-sandbox` UID/GID `1000/1000`; no host
compiler or application PostgreSQL access was used.

## Identity and Authority

The lifecycle distinguishes submission, immutable source snapshot, Judge Job,
execution request, execution attempt, compile attempt, runtime attempt,
sandbox IDs, artifact identity/hash, and result generation. A retry creates a
new request/attempt/generation and cannot reuse the previous attempt as an
active execution. Redis and TypeScript completion validation require exact
request, job, submission, attempt, generation, language profile, and source
hash bindings. Equivalent terminal duplicate results are idempotent;
conflicting or stale results are rejected.

The explicit state model covers accepted, queued, claimed, compile preparing,
compiling, compile succeeded/failed, runtime preparing, running,
cancel-requested, cancelled, raw completed, raw limit event, infrastructure
failed, cleanup pending, and cleanup verified. Terminal transitions are
monotonic and deterministic.

## Integrity Controls

- Source is staged into an exclusive attempt-owned directory. Pre-staging and
  post-staging hashes, regular-file checks, size bounds, canonical paths, and
  symlink/replacement checks reject TOCTOU mutation or cross-job pairing.
- Startup preflight verifies the frozen profile/path, identity sidecar,
  compiler version, fixed command-template identity, complete manifest file
  hashes/types/symlink targets, root ownership, and absence of writable bits.
  The real Supervisor passed this gate before listening.
- Compile artifacts are exact-attempt sidecar owned, regular non-symlink static
  ELF files with bounded size and hash. The handoff is revalidated immediately
  before runtime copy and the copied artifact is checked again.
- Workspace, sandbox bundle, cgroup scope, staged source, artifact, and runtime
  resources carry exact ownership metadata. Cleanup rechecks ownership before
  removal and never deletes broad phase prefixes.

## Queue, Retry, Cancellation, and Restart

The bounded real harness (`scripts/phase2c2-qualification.mjs`) passed:

- duplicate start delivery: two concurrent starts returned `202`, terminal
  duplicate returned `200 COMPLETED`, and an identity conflict returned `409`;
- 50/50 sequential executions and 20/20 concurrent pairs (40 attempts), with
  unique source/output and distinct compile/runtime sandbox and cgroup IDs;
- memory, pids, stdout, stderr, and wall-limit groups: 3/3 each, all clean;
- compile-preparing and runtime cancellation groups: 3/3, bounded and
  `PIPELINE_CANCELLED`, with no false completion or residue.

Real Redis repository restart qualification passed 4/4. A new repository
instance recovered an expired lease, created attempt 2, rejected attempt 1's
late result, accepted attempt 2, and a third instance read the same terminal
generation. A real Worker process crash test passed twice: Worker A was killed
after attempt 1 lease (including a runtime-window kill), Worker B recovered the
lease and persisted an attempt 2 result; no stale result overwrote it.

The real Supervisor restart test passed: an active persisted record recovered
as `PIPELINE_INFRA_FAILURE` / `SUPERVISOR_RESTART`, never as success. Exact
owned startup residue was cleaned while foreign/unknown and active classifications
are preserved by the residue audit and unit qualification.

## Raw Execution Facts

Raw facts retain process exit, exit code, termination signal where supplied by
runc, wall-limit, memory-event, pids-event, stdout/stderr truncation,
cancellation, sandbox setup failure, runtime infrastructure failure, and
cleanup verification. Controlled limit and cancellation are not marked as
infrastructure failures. A nonzero exit and a fatal trap remain raw execution
facts. No mapping to AC, WA, TLE, MLE, RE, CE, or OLE exists.

Compile source errors (`COMPILE_FAILED`), compile limits/cancellation, and
compile infrastructure/preflight failures remain distinct. Runtime normal,
nonzero, signal/termination, resource-limit, cancellation, and infrastructure
outcomes remain distinct pipeline facts.

## LIR-01..LIR-40

| IDs | Evidence | Result |
|---|---|---|
| LIR-01..04 | Source hash, staged reverify, mutation and symlink tests | PASS |
| LIR-05..06 | Frozen rootfs/profile hard preflight and mismatch fail-closed tests | PASS |
| LIR-07..10 | Artifact hash/replacement/cross-attempt checks and duplicate delivery | PASS |
| LIR-11..12 | Redis lease retry, exact generation, duplicate result protection | PASS |
| LIR-13..16 | Cancellation races and stale old-attempt result rejection | PASS |
| LIR-17..18 | Real Worker crash during compile-preparing and runtime-window recovery | PASS |
| LIR-19..21 | Supervisor restart, API repository restart, cleanup retry | PASS |
| LIR-22..24 | Startup stale-owned cleanup, foreign preservation, active classification | PASS |
| LIR-25..28 | 20 concurrent real pairs: source/artifact/output/cgroup isolation | PASS |
| LIR-29..35 | Raw exit, signal/termination, memory, pids, output and cancellation facts | PASS |
| LIR-36..37 | Compile source-vs-infra and runtime process-vs-infra semantics | PASS |
| LIR-38 | 50 sequential real executions | PASS |
| LIR-39 | 20 concurrent pairs / 40 real attempts | PASS |
| LIR-40 | Final owned zero-residue audit | PASS |

## Phase 2B Security Regression

The 11 bounded Phase 2B real named groups were rerun as dedicated non-root
tests in 41.445 seconds. Non-root preflight, backend availability, CPU and
workspace limits, Supervisor memory/pids enforcement, cancellation, repeated
pressure, three direct pressure cycles, and concurrent direct/Supervisor
isolation all passed. Evidence included finite `memory.max`/`pids.max`, cgroup
events, throttling, distinct scopes, and clean teardown. UID0, missing D-Bus,
and missing-runc paths remained fail-closed. The historical broad `TestReal*`
aggregate remains preserved and classified superseded diagnostic, not a single
final gate.

## Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 322 passed / 4 skipped
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- `pnpm ci:integration`: PASS, 4/4 (Compose up, wait, migration, integration)
- Judge Worker `go test ./...` and `go vet ./...`: PASS
- Supervisor Linux `go test ./...` and `go vet ./...`: PASS
- real Redis queue restart qualification: PASS, 4/4
- real Worker crash/restart qualification: PASS
- `git diff --check`: PASS

## Privacy, Security, and Residue

API, Worker, Supervisor, and qualification output contain no complete source,
lease token, session secret, database/Redis/MinIO credential, or unbounded
stdout/stderr logging. Public projections omit source, lease metadata, cgroup
paths, and internal runtime evidence. Worker code has no Application PostgreSQL
query path. Real execution remains explicitly gated and disabled by default.

After stopping Supervisor, Workers, and Compose infrastructure, final audit
found an empty runc list, no matching systemd scopes, no c2c2/runc cgroups, no
matching mounts or network namespaces, no guest/worker process, and no
qualification temp path. The frozen compiler rootfs is retained as a versioned
qualification asset. Foreign or unknown resources were not removed.

## Limitations and Boundary

This is development WSL reliability evidence for one static C++20 profile. It
does not claim production HA, multi-machine failover, disaster recovery,
backup restore, dynamic binaries, additional languages, testcase delivery,
expected-output comparison, checker/special judge, scoring, verdicts, or
production readiness. Phase 2D and the verdict engine remain not started.

## Final State

- Phase 2B: PASS / CLOSED
- Phase 2C: IN PROGRESS
- Phase 2C.1: PASS
- Phase 2C.2: PASS
- Real execution: reliability foundation qualified, qualification-only
- Verdict engine: NOT STARTED
- Phase 2D: NOT STARTED
- Next Phase 2C goal: permitted

Final tracked status and closure commit are recorded by the commit containing
this report and `Docs/PROJECT_STATUS.md`.
