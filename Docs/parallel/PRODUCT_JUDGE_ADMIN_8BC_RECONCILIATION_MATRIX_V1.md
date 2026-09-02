# Product Judge Admin 2C.8BC Reconciliation Matrix V1

Status: `PARTIAL / PRODUCT_RUNTIME_NOT_STABLE`

| Area | Evidence | Result |
| --- | --- | --- |
| Baseline / ancestry | Product baseline `4e3f682b101252641086d48e51825e4d8064fa74`; 2C.8B `4a6a03baef5a36641feb3d2ff889592cb65ad158`; 2C.8C `75e7d2d84900945be12ec93e00fe50e8b0008343`; frozen Judge 2C.8A `63ba05eecceb3b09ee15075c38f82522ff1e89cd` | PASS |
| History integration | Merge commits `3dd002b` (2C.8B) and `da92ab1` (2C.8C); no Judge implementation merged | PASS |
| Product read namespace | `/api/admin/judge/{summary,nodes,metrics}`, node detail/history and assignment detail | PASS |
| Product DTO | Summary normalizes Judge `countsByState` into explicit count fields; node safe DTO fields preserved | PASS |
| Product controls | Drain/offline/enable validate reason, incarnation, controlVersion, idempotency and return operation metadata | PASS |
| Permissions | `judge.view` reads; `judge.manage` controls; lifecycle remains reserved | PASS |
| CSRF / audit | CSRF double-submit cookie/header and durable audit repository/migration | PASS (contract) |
| Error mapping | Stable 401/403/404/409/502/504 Product codes | PASS (contract) |
| Web client | Product-only namespace; typed summary/nodes/history/assignment/metrics/mutations; CSRF header | PASS |
| Browser responsive | 1440x900, 1024x768, 390x844; no horizontal overflow; no unexpected console errors | PASS |
| Real Product runtime | Compose initially healthy and migration passed; later Windows forwarding/API readiness lost PostgreSQL/Redis/Storage | BLOCKED |
| Product -> real Judge | No safely available external 2C.8A service/nodes in this turn | NOT VERIFIED |
| Worker/Supervisor multi-node | Explicitly deferred to 2C.8E | NOT IN SCOPE |

The integration branch does not contain Judge Service implementation history; the 2C.8A contract remains an external frozen authority.
