# Product Judge Admin Adapter Error Matrix V1

| Upstream condition | Product response |
| --- | --- |
| node missing | 404 `JUDGE_NODE_NOT_FOUND` |
| stale incarnation | 409 `JUDGE_NODE_STALE_INCARNATION` |
| control version conflict | 409 `JUDGE_NODE_CONTROL_CONFLICT` |
| invalid transition | 409 `JUDGE_NODE_INVALID_TRANSITION` |
| timeout | 504 `JUDGE_SERVICE_TIMEOUT` |
| unavailable/auth/config/malformed response | 502 `JUDGE_SERVICE_UNAVAILABLE` |

Messages are fixed and safe; request and correlation IDs remain available in headers/audit records.
