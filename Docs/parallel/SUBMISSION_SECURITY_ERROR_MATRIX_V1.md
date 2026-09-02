# Submission Security Error Matrix V1

| Condition | Product behavior | Verdict behavior |
| --- | --- | --- |
| No published version / unsupported language | stable Product error, no dispatch | none |
| Missing object, byte/hash/manifest mismatch | fail closed, no dispatch | none |
| Object storage unavailable | fail closed, no dispatch | none |
| Judge Service unavailable | submission is not projected as a verdict | none |
| Worker/Supervisor infrastructure failure | Product projects `INFRA_FAILED` | never `RE` |
| Cancellation | Product projects `CANCELLED` | never `WA` or another verdict |
| Stale generation/result | existing 2C.6 authority rejects it | none |
| Duplicate dispatch/publication | existing idempotency returns one logical evaluation | unchanged |

Product logs must not contain source or hidden testcase bytes. Browser responses
omit storage keys, expected output, retrieval capabilities, Worker leases, and
Judge credentials. Worker configuration does not receive Product DB or broad
storage credentials from this integration.
