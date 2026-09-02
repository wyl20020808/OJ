# Web Judge Admin UI State Matrix V1

| State | UI behavior |
|---|---|
| loading | skeleton blocks |
| 401/403 | truthful no-access error |
| 502/504/network | retryable service error |
| empty/filter miss | explicit empty message |
| stale/409 | banner, no automatic destructive retry, reconfirm required |
| partial history | node detail remains visible; affected history says unavailable |
| pending/success/failure | operation status notice |
| Host Agent absent | lifecycle controls disabled and reason shown |

Fixture mode is contract-only qualification and is not enabled by production routing.
