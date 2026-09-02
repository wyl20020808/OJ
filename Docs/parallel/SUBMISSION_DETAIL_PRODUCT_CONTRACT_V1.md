# Submission Detail Product Contract V1

Product exposes Submission Detail through its existing Submission authorization
boundary. `GET /api/submissions/:id/evaluations` returns safe generation
summaries and `GET /api/submissions/:id/evaluations/:generation` returns the
selected generation's persisted safe detail. A caller must first pass the
existing Submission visibility policy.

The detail response contains Product submission identity, language, submitted
and completed timestamps, evaluation status and optional authoritative verdict,
safe aggregates, a bounded compiler diagnostic where applicable, and ordered
testcase rows. It does not expose the Judge job, manifest, object storage,
testdata identifiers, raw execution record, source hash, lease, node, token,
or sandbox implementation data.

For `QUEUED`, `RUNNING`, `REJUDGE_PENDING`, and `REJUDGING`, Product returns
only the authoritative overall state. It does not manufacture testcase
progress. A terminal persisted detail remains readable when Judge Service is
unavailable. The existing owner-only source policy is unchanged and is a
separate response concern from the testcase detail projection.

Product does not derive or reinterpret a verdict. It only accepts the safe
terminal detail emitted by the Judge Service alongside the existing
authoritative verdict publication.
