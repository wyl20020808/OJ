# OJPlatform Phase 2C.3 Deterministic Testcase Execution / Measurement Contract

## Decision

**PHASE 2C.3 DETERMINISTIC TESTCASE EXECUTION / MEASUREMENT CONTRACT: PASS**

The qualified result is a deterministic, immutable single-testcase execution
record. This phase does not implement verdict mapping, expected-output
comparison, checker or special judge support, scoring, multi-testcase
aggregation, additional language profiles, or Phase 2D.

## Provenance

- Repository: `D:\OJPlatform`
- Branch: `master`
- Starting HEAD: `63cd1f9d8b8ff16191b6d7e1623839dc8de79850`
- Phase 2B baseline: `82431fc` (`docs: close phase 2B sandbox security qualification`)
- Phase 2C.1 baseline: `0f63c33` (`docs: close phase 2C.1 execution foundation`)
- Phase 2C.2 baseline: `63cd1f9` (`docs: close phase 2C.2 reliability qualification`)
- Implementation commit: `d61b246` (`feat: add deterministic testcase execution records`)
- Qualification commit: `5f0d036` (`test: qualify phase 2c3 testcase contract`)
- Closure commit: the commit containing this report and `Docs/PROJECT_STATUS.md`
- Final HEAD: recorded after the closure commit
- No reset, checkout, clean, force operation, rebase, or history rewrite was used.
- Existing untracked user files and prior reports were preserved.

## Frozen Contract

Every real testcase job freezes `problem_id`, `problem_revision_id`, exact
`testdata_version_ref`, `testcase_id`, input SHA-256, fixed
`execution_profile_id`, source snapshot/hash, and the execution attempt
identity at enqueue. `latest`, partial testcase fields, unsafe testcase IDs,
wrong hashes, and profile mutation are rejected fail-closed. The Worker does
not query Application PostgreSQL or select a later testdata version.

Supervisor-owned staging uses exclusive creation, regular-file and canonical
path checks, inode identity checks, hash/size revalidation, and a final
replacement/symlink check immediately before runtime. The only enabled profile
is `cpp20-gcc-13-v1`; its artifact hash, compiler rootfs identity, fixed
limits, filesystem/network/seccomp policy IDs, environment allowlist and
stdin cap are part of the record. User requests cannot choose a host path,
descriptor, mount, command, environment, network target, or cwd.

Stdin is delivered from the Supervisor-owned staged testcase bytes. Its byte
count and SHA-256 are recorded, including empty, newline, bounded and binary
like inputs. Setup duration is separate from testcase wall time; wall time
uses a monotonic clock around the actual execution stage and excludes queue
waiting. CPU usage is read from isolated cgroup v2 `cpu.stat` `usage_usec`;
memory max/current/peak and events come from cgroup v2 (`memory.peak` when
available, with explicit no-sampling semantics); pids max/current/events come
from cgroup v2. No estimate is presented as a kernel measurement.

Stdout and stderr are independently bounded at 64 KiB, with byte counts,
SHA-256 values and explicit truncation flags. Raw facts preserve process exit,
exit code, proven wait-status signal, wall-limit, memory and pids events,
cancellation, setup/infra failure and cleanup verification. Host runc signals
caused by cancellation or limits are cleared unless guest wait status proves a
signal; exit status 137 is never mapped to `SIGKILL`.

`SingleTestcaseExecutionRecord` is versioned `2C.3`, digest-bound and carries
submission snapshot, artifact, testcase, profile, stdin, wall/CPU/memory/pids,
outputs, raw facts, pipeline outcome and cleanup status. Publication remains
attempt/generation authoritative, idempotent for an equivalent terminal
duplicate, and rejects conflicting or stale records. The record answers
"what happened?" and contains no verdict.

## Qualification Evidence

The real Supervisor ran as dedicated non-root `oj-sandbox` UID/GID `1000/1000`
with rootless runc and the frozen compiler rootfs. The Phase 2C.3 qualification
script completed with:

```json
{"repeats":20,"pairs":10,"repeatability":"PASS","concurrentIsolation":"PASS","wrongHash":"PASS","wall":"PASS","output":"PASS","nonzero":"PASS","signal":"PASS","cancellation":"PASS","records":"PASS"}
```

The explicit Redis qualification ran with the Compose Redis service and passed
4/4 tests: concurrent duplicate/distinct enqueue and claim isolation,
completion versus expiry/stale retry races, unavailable/disconnected/reconnect
behavior, and attempt authority across repository restart. Compose API
integration passed 4/4 after migration.

Phase 2B security regression was rerun as non-root R4/R34 groups. Preflight,
rootless runc/user namespaces, CPU throttling, memory and pids enforcement,
workspace and output bounds, cancellation, repeated pressure, direct kernel
events and concurrent isolation all passed. The Supervisor Linux package
passed `go test ./...` and `go vet ./...` with `GOFLAGS=-buildvcs=false`; the
Windows host invocation remains an environment/Unix-syscall limitation.

## TCX-01..TCX-40

| IDs | Result | Evidence |
|---|---|---|
| TCX-01..TCX-06 | PASS | immutable identity, exact version, hash, staging reverify, mutation/symlink and cross-job checks |
| TCX-07..TCX-09 | PASS | Supervisor-controlled exact stdin, empty and bounded byte/hash tests |
| TCX-10 | PASS | fixed `cpp20-gcc-13-v1` profile and artifact/policy binding |
| TCX-11..TCX-14 | PASS | monotonic short/near-limit/limit/cancel distinction in real qualification |
| TCX-15..TCX-20 | PASS | isolated cgroup CPU, memory max/peak/events and pids facts; R4/R34 evidence |
| TCX-21..TCX-25 | PASS | independent bounded stdout/stderr metadata and truncation tests |
| TCX-26..TCX-29 | PASS | nonzero exit, proven signal, infra and cancellation raw facts |
| TCX-30..TCX-32 | PASS | immutable record identity, stale rejection and idempotent publication tests |
| TCX-33 | PASS | 20 deterministic executions; stable source/artifact/testcase/stdout/exit semantics |
| TCX-34 | PASS | 10 concurrent pairs / 20 attempts |
| TCX-35..TCX-36 | PASS | cross-testcase stdin/output and cross-job artifact/workspace/cgroup isolation |
| TCX-37..TCX-39 | PASS | cleanup after normal, limit and cancellation paths |
| TCX-40 | PASS | final owned runtime residue audit: zero |

## Security, Regression and Skip Audit

- Phase 2B/2C security regression: PASS; no source compile/execute/eval/shell
  fallback, no Application PostgreSQL access from Worker, no secret/source
  logging, and real execution remains explicitly gated.
- TypeScript: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  (326 passed / 4 skipped), `pnpm test:architecture`, and `pnpm build`: PASS.
- API integration: `pnpm ci:integration`: migration and 4/4 integration tests
  PASS.
- Judge Worker: `go test ./...` and `go vet ./...`: PASS.
- Supervisor Linux unit and non-root security qualifications: PASS as detailed
  above. Two Windows-host full-suite fixtures (`TestOCIConfigCarriesFiniteResources`
  and `TestProductionSupervisorRejectsRootQualification`) are environment/
  fixture-blocked and are not used to claim a Windows runtime pass.
- The four default skipped Redis tests are opt-in only under
  `OJPLATFORM_QUEUE_REDIS_QUALIFICATION=true`; they cover Q03/Q04/Q06,
  Q10/Q18/Q19, R01/R02/R03/Q27 and LIR-11/16/20. They were explicitly rerun
  with Redis available and all 4 passed. They are not default hard gates.

## Cleanup and Limitations

After qualification, the Supervisor, Compose services and temporary runtime
records were stopped. No owned process, runc container, systemd scope, cgroup,
mount, netns, staged stdin, workspace or output temporary file remained. The
versioned compiler rootfs is retained as a qualification asset. Pre-existing
untracked repository files remain untouched.

This is development WSL evidence for one static C++20 profile. It does not
claim production HA, cluster or multi-machine failover, disaster recovery,
backup restore, dynamic binaries, other languages, verdicts, expected-output
comparison, checker, scoring, aggregation, or production readiness.

The future Verdict Engine may consume this record and independently map raw
facts and output against a problem contract. That engine, verdict mapping and
Phase 2D remain not started.

## Final State

- Phase 2B: PASS / CLOSED
- Phase 2C: IN PROGRESS
- Phase 2C.1: PASS
- Phase 2C.2: PASS
- Phase 2C.3: PASS
- Verdict Engine: NOT STARTED
- Phase 2D: NOT STARTED
- Final owned runtime residue: ZERO
- Final tracked worktree: clean after closure commit; pre-existing untracked files preserved
