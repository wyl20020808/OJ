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
| F: durable failure state, safe retry, crash recovery, idempotency | IMPLEMENTED / PARTIALLY TESTED | PostgreSQL crash/failure integration pending; Judge HTTP retry tested |
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

Known verification gaps: six full-suite TS failures remain to compare with the
baseline. Two lint `any` errors and two broad Linux Supervisor failures also need
baseline/platform confirmation. The manager ownership harness reported an unknown
web process in its mocked environment. These are not classified as regressions or
baseline failures without further evidence.

NOT VERIFIED. Record compressed/expanded bytes, testcase count, upload and publish
durations, dispatch/claim bytes, artifact transferred bytes, available peak-memory
measurements, final verdict, and complete correlation IDs here after qualification.

## Safety and Completion

No new protocol is production-qualified by this Goal. User code remains inside
the existing sandbox boundary. All required implementation and validation remain
open until supported by executed evidence; no limit-only workaround is acceptable.
