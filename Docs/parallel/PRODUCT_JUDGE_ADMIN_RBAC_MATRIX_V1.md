# Product Judge Admin RBAC Matrix V1

| Permission | Allowed operations |
| --- | --- |
| `judge.view` | summary, nodes, node detail, assignments, jobs, failures, assignment detail, metrics |
| `judge.manage` | drain, offline, enable |
| `judge.lifecycle` | reserved for future Host Agent; no V1 endpoint |

Guest and normal users are denied. A valid password session and an explicitly assigned permission are required. Mutations additionally require CSRF, reason, idempotency key and expected incarnation/control version.
