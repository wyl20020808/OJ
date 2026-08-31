# OJPlatform Phase 2C.4 Testcase Set Execution / Aggregation Foundation

## Decision

**PHASE 2C.4: PASS**

The immutable testcase-set contract, compile-once/run-many execution path,
independent per-testcase sandbox records, ordered aggregate execution facts,
cancellation, retry authority, stale-result rejection, crash/restart recovery,
cross-testcase and cross-set isolation, soak, security regression, and final
owned-residue audit are implemented and qualified.

This phase aggregates execution facts only. It does not implement or claim AC,
WA, TLE, MLE, RE, CE, expected-output comparison, checker/special judge,
scoring, verdict aggregation, a complete Verdict Engine, Phase 2D, or
production judge readiness.

## Provenance

- Repository: `D:\OJPlatform`
- Branch: `master`
- Starting HEAD: `6267d08770570d1dc3e24e548e62c5f93aaa2188`
- Implementation commit: `a3af407` (`feat: add phase 2c4 testcase-set execution foundation`)
- Qualification commit: `4856438` (`test: qualify phase 2c4 testcase-set reliability`)
- Closure commit: the commit containing this report and `Docs/PROJECT_STATUS.md`
- Final HEAD: the closure commit above
- The approved Phase 2C.3 baseline remains an ancestor.
- Pre-existing untracked files were preserved. No reset, checkout, clean,
  rebase, force, or history rewrite was used.

## Frozen Contract

### Identity and manifest

An execution-set request freezes:

- problem, problem revision, and exact testdata version;
- testcase-set ID and NUL-delimited deterministic manifest hash;
- testcase count and ordered membership;
- per-member index, testcase ID, input hash, testdata version, and execution
  profile;
- submission snapshot reference and source hash;
- execution-set request/attempt identity and `cpp20-gcc-13-v1` profile.

`latest` testdata, duplicate testcase identities, order/membership changes,
wrong hashes, inserted/removed members, and manifest tampering fail closed.
The Worker does not discover or re-resolve testcases while executing a set.

### Execution and aggregation

- One compile lifecycle produces one verified immutable artifact per set
  attempt.
- Every testcase uses that artifact hash but gets a separate runtime bundle,
  input staging path, workspace, PID namespace, cgroup, output capture, cleanup,
  and immutable Phase 2C.3 record.
- Aggregate members are always emitted in manifest order.
- `RUN_ALL` continues after raw per-testcase limit/nonzero-exit facts.
- `STOP_ON_EXECUTION_BLOCKING_EVENT` may stop only on raw execution-layer
  blocking facts. It never stops on AC/WA or another verdict.
- Remaining members use `NOT_STARTED`, `CANCELLED_BEFORE_START`, or
  `SKIPPED_BY_SET_POLICY`; they are never mislabeled as verdicts.
- Aggregate records bind the original submission snapshot reference, source
  hash, artifact, revision, version, manifest, attempt, policy, counts,
  members, cancellation/infra facts, stop reason, cleanup, and digest.

### Cancellation, retry, and stale authority

- Cancellation before execution, during a testcase, between testcases,
  duplicate cancellation, and terminal cancellation are idempotent and
  bounded. Once cancellation is authoritative, no later testcase launches.
- Queue retry semantics are **restart the entire set on a new attempt**. Resume
  of a partial prior attempt is not claimed.
- Duplicate delivery is idempotent for the same request identity.
- Redis attempt/generation and set-specific request/attempt IDs are the
  authority. Late testcase or aggregate results from an older attempt cannot
  overwrite the current result.

## Crash and Restart Qualification

### TSA-26 Worker crash

Queue prefix
`oj:judge:phase2c4-worker-crash-rerun-9e3fa81f7a974ee3b712a9a4155b4b90`
was exercised with real Redis, Worker, and Supervisor processes. Worker A
leased attempt 1 and was SIGKILLed. Worker B reclaimed and completed attempt 2.
Redis ended at `COMPLETED`, attempt/result generation `2/2`, all three members
`RAW_COMPLETED`, and `cleanupVerified=true`. The older Supervisor attempt-1
record did not overwrite Redis attempt 2.

### TSA-27 and TSA-29 Supervisor interruption

A 64-member active set was interrupted while exact owned runtime
`c2c4-2321505191/testcase-014` and its rootless-runc process existed. The
Supervisor and only its Goal-owned unit processes were killed. The runtime root
remained, proving cleanup had been interrupted. Restarting the identical
non-root systemd user unit:

- removed only the exact owned runtime residue;
- recovered the persisted set as `PIPELINE_INFRA_FAILURE`;
- emitted all remaining members as `CANCELLED_BEFORE_START`;
- reported `cleanup_verified=true`; and
- did not fabricate a completed set.

A post-fix 16-member rerun additionally proved the recovered aggregate retained
the exact original `snapshot_id=submission:snapshot-recovery-authoritative`
instead of substituting the source hash. Worker and API validators now reject
cross-snapshot aggregates.

### TSA-28 API restart

A 64-member active set remained authoritative across a scoped API restart on
port 3024 (PID `16604` to `45164`). Redis completed attempt/generation `1/1`
with 64/64 ordered members and verified cleanup. The restarted API returned
HTTP 200 and the same Phase 2C.4 aggregate. The scoped API and Worker were then
stopped.

## TSA-01..TSA-40

| ID | Result | Evidence |
|---|---|---|
| TSA-01 | PASS | immutable set identity validation |
| TSA-02 | PASS | exact problem revision binding |
| TSA-03 | PASS | exact non-`latest` testdata version binding |
| TSA-04 | PASS | deterministic NUL-delimited manifest hash |
| TSA-05 | PASS | manifest and aggregate ordering tests |
| TSA-06 | PASS | manifest-hash tamper rejected |
| TSA-07 | PASS | inserted, removed, reordered, or changed member rejected |
| TSA-08 | PASS | duplicate testcase IDs explicitly rejected |
| TSA-09 | PASS | one compile call/result per set attempt |
| TSA-10 | PASS | one verified artifact hash bound to every member |
| TSA-11 | PASS | testcase 1 set-attempt/index/hash record binding |
| TSA-12 | PASS | testcase N set-attempt/index/hash record binding |
| TSA-13 | PASS | immutable ordered aggregate record and digest |
| TSA-14 | PASS | real `RUN_ALL` set soak |
| TSA-15 | PASS | cancel before first testcase |
| TSA-16 | PASS | bounded cancel during active execution |
| TSA-17 | PASS | deterministic cancel-after-member test prevents next launch |
| TSA-18 | PASS | duplicate/terminal cancel idempotency |
| TSA-19 | PASS | no launch after authoritative cancellation |
| TSA-20 | PASS | explicit partial member states and counts |
| TSA-21 | PASS | raw blocking-event policy; no verdict mapping |
| TSA-22 | PASS | duplicate delivery/request identity idempotency |
| TSA-23 | PASS | lease expiry/retry restarts whole set on new attempt |
| TSA-24 | PASS | stale per-testcase attempt/index/hash rejected |
| TSA-25 | PASS | stale/conflicting aggregate rejected |
| TSA-26 | PASS | real Worker SIGKILL, Redis reclaim, attempt 2 authority |
| TSA-27 | PASS | active Supervisor restart recovered fail closed |
| TSA-28 | PASS | active API restart preserved Redis authority |
| TSA-29 | PASS | interrupted cleanup removed exact owned residue on startup |
| TSA-30 | PASS | TC2 observed `FS_CLEAN` after TC1 marker write |
| TSA-31 | PASS | TC1 child process did not survive into later testcase |
| TSA-32 | PASS | per-member stdout hashes remained distinct and ordered |
| TSA-33 | PASS | distinct testcase cgroups and clean accounting |
| TSA-34 | PASS | concurrent sets kept identity/artifact/runtime isolation |
| TSA-35 | PASS | cancelling one concurrent set did not affect its peer |
| TSA-36 | PASS | concurrent resource profiles used independent cgroups |
| TSA-37 | PASS | deterministic digest and idempotent duplicate publication |
| TSA-38 | PASS | 20 sequential sets / 60 testcase executions |
| TSA-39 | PASS | 10 concurrent pairs / 20 sets |
| TSA-40 | PASS | final Goal-owned runtime residue zero |

## Soak and Isolation Evidence

`scripts/phase2c4-qualification.mjs` completed with:

```text
sequentialSets=20
testcaseExecutions=60
concurrentPairs=10
manifestTamper=PASS
cancellation=PASS
filesystemCarryOver=PASS
processCarryOver=PASS
outputCarryOver=PASS
cgroupCarryOver=PASS
crossSetCancellation=PASS
crossSetResourceIsolation=PASS
ordering=PASS
verdictMapping=NONE
```

The fixture used controlled deterministic actions only. Testcase output was
recorded as raw bytes/hashes; it was never compared with expected output.

## Security Regression

Bounded non-root named groups passed under dedicated host UID/GID `1000/1000`:

- rootless runc and OCI user namespace mapping;
- guest UID/GID 0 mapped to the dedicated non-root host identity;
- host/project/home/credential and cross-workspace filesystem denial;
- no default route and denial of host/API/PostgreSQL/Redis/MinIO/DNS targets;
- PID namespace isolation, empty effective capabilities, NoNewPrivileges, and
  seccomp filter mode;
- finite CPU, memory, pids, output, and workspace controls;
- real `memory.events` and `pids.events` enforcement;
- cancellation cleanup and three concurrent independent-cgroup cycles.

Worker capability/config tests confirm no Application PostgreSQL access.
`REAL_SUBMISSION_EXECUTION` remains rejected by the probe adapter, real
execution remains explicitly gated, and no weak or unqualified fallback exists.

## Quality and Skipped-Test Audit

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: 333 passed / 4 skipped
- Redis opt-in recovery suite: 4/4 PASS
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- API infrastructure integration: 4/4 PASS
- Phase 2C.4 focused Vitest: 7/7 PASS
- Supervisor `go test ./...` and `go vet ./...`: PASS on Linux
- Judge Worker `go test ./...` and `go vet ./...`: PASS on Linux
- `gofmt -l`: no output
- `git diff --check`: PASS

The four default skips are exactly the opt-in Redis queue qualification cases:
concurrent enqueue/claim, completion-vs-expiry/stale race,
outage/reconnect, and repository restart. They were rerun with
`OJPLATFORM_QUEUE_REDIS_QUALIFICATION=true` against the disposable Goal-owned
Redis and all four passed. They are not blockers. Conditional Playwright suites
are outside this non-Web Phase 2C.4 hard gate.

## Final Residue and Boundaries

After qualification, the Goal-owned API, Workers, Supervisor, Redis, and test
processes were stopped. The final audit found:

- no Goal-owned process or listener on ports 19104, 56379, or 3024;
- no rootless-runc container;
- no Phase 2B/2C sandbox scope or cgroup;
- no Goal-owned mount or network namespace;
- no source/testcase staging, artifact, workspace, or child-process residue;
- no `/tmp/ojplatform-phase2c4*` path.

Foreign and unknown resources were not removed. This is development WSL
qualification for the fixed static C++20 profile. It does not claim production
HA, multi-machine failover, disaster recovery, production security approval,
or production judge completeness.

## Final State

- Phase 2B: PASS / CLOSED
- Phase 2C.1: PASS
- Phase 2C.2: PASS
- Phase 2C.3: PASS
- Phase 2C.4: PASS / multi-testcase execution-fact aggregation foundation qualified
- Phase 2C: IN PROGRESS
- Verdict Engine: NOT STARTED
- Phase 2D: NOT STARTED
- Ready for the next approved Phase 2C Goal: YES
- Final tracked worktree: clean after the closure commit; pre-existing untracked files preserved
