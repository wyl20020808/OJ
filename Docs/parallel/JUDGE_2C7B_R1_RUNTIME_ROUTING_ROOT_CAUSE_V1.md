# Judge 2C.7B-R1 Runtime Routing Root Cause V1

## Scope

This record covers the narrow service-mode path from Judge Service assignment
claim through the per-node Supervisor execution-set request. It does not
redesign node scheduling, Product publication, or sandbox policy.

## Observed Baseline Failure

The retained Phase 2C.7B evidence showed that Node A made successful
assignment claims and moved `BUSY -> CLAIMING` three times, while no
Supervisor execution-set record was created. The retained Worker log did not
contain the exact HTTP/transport or Supervisor validation error after each
claim. Therefore this document does not attribute the historical missing
record to an unobserved network failure or to any one historic payload.

## Directly Observed Defects

1. The standalone Judge Service was run as a least-privilege runtime role
   after migrations had created `judge_nodes` under an administrative owner.
   The role had only default privileges, so existing node-registry objects
   were not accessible. A live authenticated node-management read failed with
   PostgreSQL `42501 permission denied for table judge_nodes`. This made the
   service-mode node control path unavailable even though the migration itself
   had succeeded.
2. The Worker accepts the V1 maximum of 64 testcase inputs at 64 KiB plus a
   256 KiB source snapshot. The Supervisor previously capped the JSON
   execution-set request at 1 MiB, which is smaller than a valid
   base64/JSON-encoded maximum payload. This was a real producer/consumer
   contract contradiction, even though the retained historical log cannot
   prove it was the exact error for the earlier small jobs.
3. Service-mode cancellation had relied on the Worker-local queue namespace.
   That namespace is not an authority in the standalone Service boundary, and
   an older running service lacked the assignment-bound cancellation-status
   endpoint. A malformed cancellation observation was also silently treated
   as not cancelled.

## Remediation

- `scripts/judge-service-bootstrap.mjs` grants the runtime Judge role access
  to existing Judge tables and sequences as well as future objects.
- `scripts/judge-service-migrate.mjs` accepts `JUDGE_DATABASE_ROLE` and
  applies the same scoped grants after an administrator-owned migration.
- `apps/sandbox-supervisor/cmd/supervisor/set_protocol.go` uses a bounded
  8 MiB request envelope, with a focused maximum-valid-payload test.
- The Worker strictly validates every successful claim response before it can
  enter `BUSY`, and rejects cleartext non-loopback Judge Service URLs.
- Assignment-bound cancellation observation is implemented by the Service,
  uses the current node incarnation, and retains lease-bound cancellation
  authority. Observation failures are safely rate-limited and logged without
  leaking source, tokens, or URL text; they never fabricate cancellation or
  fall back to a Worker-local Redis prefix.
- In-memory capacity reservation now rechecks current node state and the
  service compensates a lost reservation race with the current lease.

## Verification Boundary

The ACL failure was directly observed and corrected. The payload envelope,
claim validation, cancellation authority, and capacity compensation are
covered by focused tests. The final qualification report records the separate
fresh runtime evidence for the repaired handoff path and does not reuse the
historical missing-record logs as proof of a specific unlogged exception.

## Conclusion

`RUNTIME ROUTING ROOT CAUSE = IDENTIFIED`

The identified deployment ACL defect was sufficient to break the live
service-mode node control path. The corrected bounded handoff contract removes
the independent valid-payload rejection risk. The historical post-claim error
remains intentionally classified as unobserved rather than retroactively
asserted.
