# OJPlatform Phase 2C.5 Deterministic Verdict Foundation V1

## Decision

**PHASE 2C.5 STATUS: PASS / QUALIFIED FOR THE NEXT JUDGE GOAL**

This Goal establishes deterministic AC, WA, CE, TLE, MLE, and RE mapping from
trusted immutable Phase 2C.4 raw execution facts. Infrastructure failure,
cancellation, stale attempts, incomplete facts, and integrity failures remain
non-verdict states. No Lead Integration was performed.

## Provenance and Git

- Branch: `codex/phase2c5-deterministic-verdict-foundation`
- Starting HEAD: `73537b6a3728d6b986d5a8f265db3ba4702a0ca0`
- Final implementation HEAD: `09294f1` (`feat: add phase 2c5 deterministic verdict engine`)
- Report/closure commit: pending until this report is committed
- Baseline closure: `73537b6` (Phase 2C.4)
- `master` was not changed and still points to the Phase 2C.4 baseline.
- Existing untracked user/project artifacts were preserved.

`MASTER PROJECT_STATUS NOT YET INTEGRATED`: this is a Judge branch Goal, not a
Lead Integration. `Docs/PROJECT_STATUS.md` was intentionally not modified.

## Protocol and Implementation

The Worker now validates Phase 2C.4 testcase-set identity, immutable manifest
and expected-output/checker bindings, then derives a sealed `2C.5-builtin-v1`
verdict record. The Supervisor and Worker use the same canonical digest rule:
the top-level `digest` field is removed before canonical JSON hashing. This
keeps raw aggregate and verdict records interoperable across processes.

The Worker publishes a verdict only after a valid, authoritative, complete raw
set result. `RUN_ALL` remains the default and no verdict-aware early stop was
introduced. The API and Redis repository revalidate result identity, record
digests, case membership, output hashes, attempt generation, manifest hash,
expected-output hash, checker version/config, and verdict digest before
persistence or public projection.

## Taxonomy and Decision Rules

The only user verdict mappings are:

| Qualified fact | User verdict |
|---|---|
| Qualified source compile failure | CE |
| Qualified time-limit event | TLE |
| Qualified memory-limit event | MLE |
| Qualified nonzero exit or attributable fatal signal | RE |
| Normal exit plus exact checker match | AC |
| Normal exit plus checker mismatch | WA |

Cancellation, sandbox/runtime/compiler/checker infrastructure failure, stale
attempt, integrity failure, incomplete termination evidence, unsupported checker
version, output truncation, and unqualified resource evidence produce
`CANCELLED`, `INFRA_FAILED`, `STALE_REJECTED`, or `NO_VERDICT`; none is converted
to a user verdict. CE is accepted only with `SOURCE_COMPILE_FAILED`, clean
compile evidence, process exit, positive exit code, no signal, and no resource,
cancel, or infrastructure fact.

## Checker and Integrity Contract

- `EXACT_BYTES`: byte-for-byte comparison, including final newline and all
  whitespace.
- `TOKEN_WHITESPACE`: ASCII whitespace is ignored between tokens; token order
  and token bytes remain exact.
- Expected output is frozen in the manifest with exact testdata version and
  SHA-256. Checker type, `builtin-v1` version, and checker-config SHA-256 are
  bound into the manifest hash and every verdict case.
- Actual stdout is bounded, length-checked, and SHA-256 checked before checking.
- Diagnostics are bounded and deterministic (`first_mismatch_offset` or
  `token_mismatch_index`).
- Case and aggregate records are immutable, attempt-bound, manifest-ordered,
  and self-sealed with canonical digests.

## VER-01..80 Matrix

| Range | Result | Evidence |
|---|---|---|
| VER-01..09 | PASS | EXACT/TOKEN unit coverage; 100-repeat deterministic checker test |
| VER-10..18 | PASS | expected/actual/checker hash, version, path, output-bound and diagnostic rejection tests |
| VER-19..31 | PASS | AC/WA/TLE/MLE/RE/CE decision-order tests and real qualification |
| VER-32..40 | PASS | aggregate order, first non-AC, RUN_ALL, cancellation, infra, and incomplete tests |
| VER-41..53 | PASS | duplicate persistence, stale rejection, retry generation, Redis concurrency, API repository restart, and Worker crash recovery |
| VER-54..61 | PASS | deterministic recomputation, expected/checker binding, cross-job identity rejection, no checker network/privilege/DB path |
| VER-62..69 | PASS | Phase 2C.4 tests plus Phase 2B trusted-probe/security regression |
| VER-70..73 | PASS | TypeScript gates, Go gates, architecture, and build |
| VER-74 | PASS | skipped-test audit below; opt-in Redis and real Worker tests were run |
| VER-75..76 | PASS | 100-repeat checker determinism in `verdict_test.go` |
| VER-77..78 | PASS | 20 sequential and 20 concurrent real verdict sets |
| VER-79..80 | PASS | final owned residue zero and exact service/queue cleanup |

## Real End-to-End Qualification

The bounded live qualification script used Redis `127.0.0.1:56379`, the Go
Worker, the non-root Supervisor, compiler sandbox, runtime sandbox, raw records,
checker, and verdict persistence. Result:

```json
{"AC":"PASS","WA":"PASS","TOKEN":"PASS","CE":"PASS","RE":"PASS","TLE":"PASS","MLE":"PASS","MIXED_RUN_ALL":"PASS","DUPLICATE":"PASS","CANCEL":"PASS","SEQUENTIAL_SETS":20,"CONCURRENT_SETS":20}
```

The duplicate case retained the same immutable raw/verdict record. Cancellation
ended with `CANCELLED` and no verdict record. The mixed set retained all three
case records after WA, proving `RUN_ALL`.

## Reliability and Recovery

- Redis opt-in queue qualification: 4/4 tests PASS, including duplicate enqueue,
  concurrent claim race, expiry recovery, stale-token rejection, reconnect,
  and repository restart.
- Real Worker crash recovery: PASS; Worker B recovered a lease as a new
  execution attempt and the old attempt could not overwrite it.
- Phase 2C.4 focused regression: 16/16 PASS, including immutable aggregate,
  retry/new attempt, duplicate/stale/conflicting publication, and manifest
  binding.
- API repository restart and Supervisor restart semantics are inherited from
  the qualified Phase 2C.2/2C.4 contracts and remain fail-closed on stale or
  infrastructure results.
- Tampered aggregate, testcase record, stdout, expected-output, checker config,
  provenance, attempt, and verdict records are rejected before completion.

## Security and Regression

- Phase 2B focused security/control regression: 116/116 PASS.
- Trusted-probe isolation and non-root Supervisor groups PASS, including
  filesystem/network/process/privilege/seccomp, CPU, memory, pids,
  cancellation, repeated pressure, and concurrent isolation.
- Fresh Supervisor evidence included finite cgroup values and events:
  `memory.max=33554432`, `pids.max=16`, memory `max` events, and pids `max`
  events. No status code or RSS heuristic was used as kernel enforcement proof.
- Worker has no Application PostgreSQL access. Public projections omit source,
  expected output, actual stdout, lease secrets, and internal infrastructure
  fields. Qualification fixtures are trusted and inert except for the existing
  gated C++20 real execution path.

## Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 335 passed / 4 skipped
- `pnpm test:architecture`: PASS
- `pnpm build`: PASS
- Judge Worker `go test ./...`: PASS
- Judge Worker `go vet ./...`: PASS
- `git diff --check`: PASS before implementation commit

## Skipped-Test Audit and Limitations

The default TypeScript suite skips four tests: three Redis opt-in tests and one
optional browser/runtime test. The Redis suite was explicitly run with
`OJPLATFORM_QUEUE_REDIS_QUALIFICATION=true` and passed 4/4. The real Worker
crash test was explicitly run with `OJPLATFORM_REAL_WORKER_PROCESS_TEST=true`
and passed. Browser/product tests are outside this Judge-only Goal and were
not used to claim verdict qualification.

Three legacy Supervisor diagnostics were run under the dedicated non-root WSL
user and failed because no cgroupfs scope was observable in that diagnostic
mode: `TestRealRuncCgroupfsCurrentLimits`,
`TestRealRuncCgroupfsMemoryEvidence`, and
`TestRealRuncCgroupfsPidsEvidence`. These are classified **TEST BLOCKED / host
environment diagnostic limitation**, not converted to PASS and not used as the
source of the passing cgroup enforcement claim. The applicable non-root
Supervisor/R4/R34 enforcement groups passed with direct cgroup evidence.

This Goal does not implement Special Judge, interactive/floating/scoring
checkers, OLE, subtasks, contests, multi-language verdicts, production HA,
cluster failover, multi-machine failover, disaster recovery, or Phase 2D.

## Final Residue Audit

After evidence collection, only the exact Goal-owned Supervisor and Worker
processes were stopped. The exact temporary Supervisor root, record root, set
root, and binaries were removed. The exact Redis namespace
`oj:judge:phase2c5:*` had 101 keys removed. Final checks found no matching
Goal-owned processes, systemd units, temporary roots, or active owned runc
containers. Shared Redis, PostgreSQL, and MinIO infrastructure was not stopped
or deleted and remains outside this Goal's ownership.

## Final State

- `CODE EXISTS`: yes
- `FEATURE IMPLEMENTED`: yes
- `FEATURE TESTED`: yes
- `FEATURE RUNTIME QUALIFIED`: yes, for the frozen C++20/Phase 2C.5 scope
- `PRODUCTION READY`: no
- `READY FOR NEXT JUDGE GOAL`: YES

Final implementation commit: `09294f1`. The report/closure commit follows.
