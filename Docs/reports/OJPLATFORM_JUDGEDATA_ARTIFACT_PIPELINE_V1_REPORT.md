# JudgeData Artifact Pipeline V1

Status: PARTIAL / IN PROGRESS. Focused implementation tests pass; complete runtime
qualification has not run and no Goal PASS is claimed.

Baseline: `766e6c0ec5e66292bb93b80e2367a0f2a9a86a76` (canonical main).
Worktree: `D:\OJPlatform-worktrees\judgedata-artifact-pipeline-v1`.
Branch: `codex/judgedata-artifact-pipeline-v1`. Main must not be merged.
Decision: [ADR 0006](../adr/0006-judgedata-artifact-dispatch.md), PROPOSED.

## Acceptance and Evidence

| Requirement | Status | Required evidence |
| --- | --- | --- |
| A: streaming upload, backpressure, finite compressed/expanded/entry budgets | IMPLEMENTED / FOCUSED TESTED | Real >=100 MiB HTTP qualification pending |
| A: bomb/traversal/duplicate/CRC/hash/abort/partial-object cleanup | FOCUSED TESTED | Streaming ZIP negative tests; runtime cleanup inspection pending |
| Immutable artifact identity, version, size, hash, creation metadata | IMPLEMENTED / FOCUSED TESTED | Canonical metadata digest tests pass; DB migration qualification pending |
| B: Product dispatch contains no testcase content | IMPLEMENTED / FOCUSED TESTED | 100 MiB metadata request below 4 KiB; real measurement pending |
| C: Judge persistence and Worker claims contain references only | IMPLEMENTED / FOCUSED TESTED | HTTP claim below 8 KiB; legacy capability rejected; real DB/Redis evidence pending |
| D: bounded Worker fetch, retry, checksum/truncation/oversize rejection | IMPLEMENTED / FOCUSED TESTED | Go fetch tests pass; real MinIO transfer pending |
| E: reference/file-backed Supervisor input, no base64 dataset | IMPLEMENTED / NOT RUNTIME VERIFIED | Endpoint/control integration and real execution pending |
| E: private handles, traversal/symlink/TOCTOU protection | PARTIALLY TESTED | Ownership/replacement/expiry/capacity tests pass under non-root WSL; full adversarial audit pending |
| F: durable failure state, safe retry, crash recovery, idempotency | IMPLEMENTED / PARTIALLY TESTED | Real PostgreSQL temporary-table SQL tests and Judge HTTP retry passed; complete service crash/retry flow pending |
| F: request/submission/evaluation/job/artifact correlation | IMPLEMENTED / NOT RUNTIME VERIFIED | Structured logs from complete real flow pending |
| F: sanitized typed error mapping | IMPLEMENTED / PARTIALLY TESTED | Remaining failure-path tests pending |
| G: versioned Job/artifact/Worker/Supervisor contracts | IMPLEMENTED / FOCUSED TESTED | Runtime compatibility check pending |
| G: Runtime Manager rejects stale protocol/binary | IMPLEMENTED / NOT RUNTIME VERIFIED | PowerShell syntax passed; runtime capability check pending |
| H: ADR accepted only after implementation and validation | PROPOSED | Complete acceptance audit |
| I: old published versions work without re-upload | IMPLEMENTED / FOCUSED TESTED | Lazy conversion and old-version authenticated reads tested |
| J: >=100 MiB single input, 256 MiB total input, consistent budgets | IMPLEMENTED / PARTIALLY TESTED | Real boundary qualification pending |
| K: all 12 requested focused contract cases | NOT TESTED | Named executed tests covering each requirement |
| L: >=100 MiB expanded real upload-to-terminal flow | NOT VERIFIED | Deterministic fixture sizes, timings, IDs, verdict, payload sizes |
| Small input, exact/token checkers, existing submission, SSE regression | NOT TESTED | Focused regressions and real API/SSE evidence |
| Product/Judge/Worker/Supervisor checks and diff review | NOT TESTED | Executed focused tests/type/lint/build/security review |
| Scoped commit, tracked clean, no main merge | PENDING | Final git status/diff/commit evidence |

## Implementation Notes

Initial source and security review confirms the 1 MiB Judge intake and 8 MiB
Worker claim limits, complete materialization in Product, and base64 Supervisor
input. These are design evidence, not execution qualification for this Goal.

Implemented streaming ZIP ingestion, immutable artifact metadata/persistence,
reference Job intake, initial durable dispatch outbox, Worker file downloads,
file-backed expected-output checkers, and authenticated Supervisor staging and
file-input execution. Worker advertises artifact execution only after Supervisor
health confirms the new version. Runtime Manager configures dedicated tokens and
checks artifact protocol plus Supervisor source/commit/binary identity.

Artifact manifest bytes now use recursively sorted JSON object keys, preserving
the digest across PostgreSQL jsonb and Go serialization. The outer execution and
new file-backed testcase record use `artifact-execution-v1`; the unchanged set
aggregate keeps its existing schema. Historical inline protocols remain separate.

## Executed Checks

- `pnpm typecheck`: PASS before the latest Go additions and record-version edit;
  final rerun pending.
- `vitest run tests/judge-artifact-contract.test.ts
  tests/streaming-judgedata-upload.test.ts tests/problem-judge-data.test.ts`:
  3 files, 33 tests PASS. Covers metadata size/key-order invariance and upload
  corruption, path, duplicate, truncation, limit and cleanup cases.
- Worker `go test ./...`: all packages PASS, including fetch failure/retry,
  redirect rejection, stream checker parity, large tokens, and corruption after
  a mismatching prefix. These are unit/HTTP test-server results, not real judging.
- Supervisor staging and legacy set validation: cross-compiled Linux tests run
  in Ubuntu-24.04 as `oj-sandbox` (UID 1000), PASS. Includes foreign handle/binding,
  tampered input, cancellation, size/capacity, expiry and cleanup.
- The POSIX staging tests initially failed on Windows because permission/owner
  qualification is unavailable there. They now live in Linux-specific tests;
  a Windows test explicitly requires staging rejection. No POSIX check was relaxed.
- A broad Windows `TestArtifact*` selection also hit the existing ELF-only
  `TestArtifactPathAndHashTamperFailClosed`; full Supervisor Linux regression
  remains pending.

## Runtime and Performance

Pre-qualification checkpoint, 2026-09-05: TS build/typecheck passed; latest focused
artifact/bridge/upload run passed 28 tests. Worker full tests and Supervisor command
protocol tests passed. Artifact persistence now rejects inconsistent stored bytes,
enforces one artifact per version and isolates returned memory references.
Formal rejudge constructs a new reference job from the historical published version.
Dispatch errors expose only the created submission ID for recovery. Supervisor
cleanup failures reseal the aggregate as infrastructure failure; result-persistence
failures are logged and cannot be read as successful terminal results.

Compatibility: artifact metadata caps output capture at the existing qualified
cpp20 ceiling (64 KiB), preserving original published authoring configuration.
Input/output file maximum is 100 MiB; total input and output maxima are each
256 MiB. ZIP compressed/expanded maximum is 256 MiB, with two concurrent API
ingestions. Supervisor staging is 512 MiB / 128 entries, with a 10-minute TTL.

Dependency assessment: `yauzl` 3.4.0 and `pend` 1.2.0 use MIT licenses;
`@types/yauzl` 3.4.0 is development-only (MIT). The existing parser requires
whole-memory ZIP access; lazy file-backed ZIP reading is needed for bounded
ingestion. No core stack change. Production dependency audit reported zero
vulnerabilities; this is dependency evidence, not security qualification.

Baseline comparison executed against canonical commit `766e6c0`:

- Baseline TS: 813 passed, 7 failed, 5 skipped. Six failures overlap with this
  branch: SDK version expectation, phone registration, two Worker UI cases,
  localized route shell and unauthenticated history. Baseline's private-author
  submission failure passes on this branch.
- Latest full branch TS run: 838 passed, 7 failed, 5 skipped. Besides the six
  baseline failures, the OTP grants test failed once (expected HTTP 200, got 400)
  and passed on a focused rerun. Its intermittent failure is recorded as residual
  test risk, not classified as a proven baseline failure. Build and architecture
  gate passed after the latest changes.
- A copy-isolation change initially introduced a legacy manifest-freezing test
  failure. `copyJob` now preserves that contract. The existing test and related
  artifact/guest tests pass (22 tests); assertions were not weakened.
- Both changed-file lint failures (`apps/api/src/app.ts` code-run `as any` and
  `apps/judge-service/src/projection.ts` raw result `Record<string, any>`) exist in
  the baseline. No new changed-file lint failures remain.
- Baseline Linux Supervisor reproduces the same two failures under `oj-sandbox`:
  `TestOCIConfigCarriesFiniteResources` expects system.slice instead of user.slice;
  `TestProductionSupervisorRejectsRootQualification` assumes root and fails on the
  missing trusted probe when run non-root. Neither assertion was changed.
- Baseline Runtime Manager ownership harness also fails its fake web-listener
  source-identity check. No actual service lifecycle is exercised by that harness.

## Offline 100 MiB Boundary Evidence

`scripts/generate-artifact-qualification.ps1` creates deterministic ZIP bytes using
a 1 MiB chunk and exclusive output creation. Executed fixture:

- ZIP bytes: 104,873,816; input bytes: 104,857,600; output bytes: 10; testcase count: 1.
- ZIP SHA-256: `939416d1516811c8b89a0e28d90a756cb7d635af4751758abdd052b16d917f3d`.
- Input SHA-256: `5bd62fc9bf2d86651969d44c6a68d4cb2be54a240353ad78465bee731da7cd64`.
- Real file-backed ingestion function: PASS, 783 ms; temporary files absent after
  completion. HTTP upload, storage publication and judge execution were not tested
  by this offline check.
- This exposed a compressed-entry limit bug: DEFLATE overhead makes a 100 MiB raw
  entry slightly larger in compressed form. Compressed bytes now use the existing
  256 MiB archive budget; raw entry size remains limited to 100 MiB. Expanded-total,
  ratio, CRC, hash and path checks remain enforced.
- Upload tests now also verify the two-ingestion concurrency limit and capacity
  recovery after cancellation (13 upload tests PASS).
- Linux Supervisor authenticated HTTP staging, empty input, release, old protocol
  rejection, legacy-status auth and persistence-failure visibility: PASS.

## Runtime Ownership Blocker

Additional checks while runtime ownership confirmation is pending:

- `vitest run --config vitest.integration.config.ts
  tests/integration/submission-dispatch.test.ts`: 5 tests PASS against real local
  PostgreSQL. Formal migrations 0020/0021 execute in session-owned temporary
  tables under `pg_temp`; each test rolls back and closes its connection. Business
  tables and the runtime migration ledger are not changed. Test-only dependency
  tables have the minimal columns needed for these migrations.
- These tests prove artifact canonical JSON persistence, duplicate-save idempotency,
  per-version conflict rejection, stored metadata tamper rejection, orphan backfill,
  one outstanding claim, stale-claim fencing, finite failure retries, explicit retry,
  and preservation of an existing terminal evaluation. They do not prove
  multi-connection contention or the full service crash/recovery workflow.
- Worker `go test ./internal/supervisorclient`: PASS, including new raw HTTP
  upload/hash/binding checks, bounded handle response, 200 MiB input metadata below
  4 KiB, host-path handle rejection and legacy Supervisor version rejection.
- The three blocking PIDs were re-read from live CIM process state on the next
  goal turn and remain present with the same creation times and relative commands.

The first checkpoint is `2fb0718`. Runtime Manager `restart -UseCurrentCheckout`
was executed after a tracked-clean commit. It stopped the registered Web and
Supervisor, but refused three unregistered listeners:

| Service | Port | PID | Observed command |
| --- | --- | --- | --- |
| Product API | 3010 | 30208 | `node --import tsx apps/api/src/server.ts` |
| Judge Service | 3100 | 45772 | `node --import tsx apps/judge-service/src/server.ts` |
| Host Agent | 3180 | 39108 | `node --import tsx apps/judge-host-agent/src/server.ts` |

Their relative commands do not identify a worktree, and the shared registry records
different PIDs. Manager reports EXTERNAL ownership and
`APPLICATION_PORT_REMAINS_OCCUPIED: 3010, 3100, 3180`. These processes were not killed.
User confirmation of ownership and permission to stop the three identified
processes is pending. Web and Supervisor are stopped; the three listeners remain.
No migration, real upload, formal qualification submission or terminal verdict was
produced. Required DB/retry integration and full 100 MiB runtime evidence remain
open. ADR is PROPOSED and Goal remains PARTIAL, with no main merge.

NOT VERIFIED. Record compressed/expanded bytes, testcase count, upload and publish
durations, dispatch/claim bytes, artifact transferred bytes, available peak-memory
measurements, final verdict, and complete correlation IDs here after qualification.

## Safety and Completion

No new protocol is production-qualified by this Goal. User code remains inside
the existing sandbox boundary. All required implementation and validation remain
open until supported by executed evidence; no limit-only workaround is acceptable.
