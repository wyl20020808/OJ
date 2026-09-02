# Submission Product Judge State Matrix V1

| Product evaluation state | Browser presentation | Verdict |
| --- | --- | --- |
| `QUEUED`, `REJUDGE_PENDING` | queued | none |
| `RUNNING`, `REJUDGING` | judging | none |
| `COMPLETED_WITH_VERDICT` | `AC`, `WA`, `CE`, `RE`, `TLE`, or `MLE` | authoritative only |
| `CANCELLED` | cancelled | none |
| `INFRA_FAILED` | infrastructure failed | none |
| `NO_VERDICT`, `INCOMPLETE` | no verdict | none |

The Product response includes the current safe evaluation projection and the
history endpoint returns generation history. Browser polling calls Product
Submission routes only, stops for terminal states, and never calls Judge
Service or object storage directly. Older-generation publication remains
rejected by the established 2C.6 current-generation authority.
