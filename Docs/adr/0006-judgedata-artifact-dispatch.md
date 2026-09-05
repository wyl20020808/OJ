# ADR 0006: JudgeData Artifact Dispatch

## Status

PROPOSED. Implementation and qualification are authorized by the JudgeData
Artifact Pipeline V1 Goal. Acceptance requires the complete evidence matrix in
the Goal report, including a real >=100 MiB formal submission. This decision
preserves the architecture baseline and ADR 0005's database separation.

## Problem

Published testcase objects currently become complete UTF-8 strings in Product,
JSON in Judge intake and Worker claims, and base64 in Supervisor requests.
Upload permits 100 MiB files, but Judge intake permits 1 MiB and Worker claims
8 MiB. Submission persistence precedes dispatch, so a dispatch failure can leave
a permanent PENDING submission with no evaluation. Increasing HTTP limits does
not fix memory amplification, recovery, or the missing data-plane boundary.

## Decision

Use an immutable, versioned metadata manifest plus individual testcase objects.
Product owns publication, object writes, and Product DB. The manifest binds an
artifact ID, published JudgeData version, format version, content length, SHA-256,
creation time, testcase identities, sizes, hashes, checker, and execution limits.
Published objects are never overwritten. Existing versions receive the same
deterministic artifact representation lazily without user re-upload.

Product-to-Judge and Judge-to-Worker carry references and bounded metadata only;
source remains bounded by the existing source contract. Judge persists references
in its own database and Redis and never receives Product DB credentials.

The Product-owned artifact data API streams only objects belonging to an immutable
published manifest. Its dedicated project-scoped read-only service credential
does not authorize ordinary Product endpoints, object listing, writes, or arbitrary
MinIO keys. Browser sessions do not authorize this API. Credentials remain in
headers/environment and never enter a Job, URL, log, or browser response.

Worker downloads to private temporary files with bounded chunks, deadlines,
length/hash checks, finite retries, and cancellation cleanup. No incomplete file
can reach execution. Expected outputs remain file-backed for streaming checkers.

For Windows/WSL and remote loopback-host compatibility, Worker streams verified
inputs to a Supervisor-owned staging data endpoint. Supervisor allocates opaque
handles, verifies length/hash, and resolves handles under its own private root.
The control endpoint accepts handles, never user-supplied host paths. Open-file
ownership, exclusive creation, no-follow rules, and verified copies into sandbox
staging protect traversal, symlink escape, and replacement races. A dedicated
service credential protects the new staging/control endpoints.

## Streaming Upload and Resources

Raw ZIP ingestion uses backpressure into a private, bounded temporary file.
Archive reading is lazy and sequential. Compressed bytes, expanded bytes, entry
count, testcase count, per-file size, compression ratio, duplicate names, path
normalization, local headers, and checksums are checked before committing a draft.
Failed or aborted requests clean temporary files and newly created objects.

Retain 256 MiB compressed upload, 100 MiB per input/output, 256 MiB total input,
and 256 MiB total expanded upload. Define output and disk/concurrency budgets
explicitly at every boundary. Control HTTP limits stay bounded independently of
testdata size. Memory scales with chunks and metadata, not the complete dataset.

## Failure, Retry, and Observability

Persist dispatch identity, state, attempts, and sanitized failure reasons.
Retries use the same submission/evaluation identity, including after uncertain
HTTP outcomes; they must not allocate another logical evaluation or Judge Job.
Crash recovery must observe unfinished dispatches, bound retries, and expose
terminal dispatch failure rather than indefinitely presenting PENDING.

Correlate request, submission, evaluation generation, Judge Job, and artifact IDs
through Product, Judge, Worker fetch, and Supervisor. Distinguish unavailable
artifact, checksum mismatch, invalid contract, dispatch unavailable, timeout, and
capacity errors without exposing hidden testdata, credentials, or filesystem paths.

## Versioning and Compatibility

Introduce explicit artifact, reference-Job, Worker, and file-backed execution
contract versions. Do not reinterpret the existing 2C.4 inline protocol. Historical
jobs/results remain readable; old published data uses bounded lazy conversion.
New formal dispatch requires compatible capabilities. Runtime Manager checks the
new health contract and binary identity before declaring the runtime ready.

## Migration and Rollback

Use additive formal migrations for durable artifacts/dispatch state. Do not rewrite
historical migrations or published JudgeData. Old application versions may read
historical submission/result records. Rollback must first drain new-contract jobs;
never send new reference jobs to old workers or silently downgrade to inline data.
Retain immutable objects while referenced by published versions/submissions.

## Dependencies and Qualification

Use a maintained ZIP reader with lazy file-backed entries rather than an in-memory
archive library. Record exact version, license, and vulnerability assessment in the
report. Native stream, crypto, filesystem, and HTTP APIs handle the data plane.
Acceptance requires contract/adversarial tests plus real MinIO/Postgres/Redis,
Product, Judge, Worker, and Supervisor execution with >=100 MiB expanded input.
