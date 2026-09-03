# Problem Public Sample Contract V1

Public samples are stored in the existing revision-owned `examples` JSON value
as the one canonical source. The V2 API projects it as `samples` records with
server-assigned contiguous `ordinal`, `input`, `output`, and optional
`explanation`.

The server accepts legacy `examples` input for compatibility, normalizes it to
`samples`, and limits samples to 100 and their combined text to 250,000
characters. Save/reload ordering is deterministic.

These samples are public problem-statement content. They are not Judge Data,
hidden testcases, MinIO objects, or `JudgeDataVersion` records.
