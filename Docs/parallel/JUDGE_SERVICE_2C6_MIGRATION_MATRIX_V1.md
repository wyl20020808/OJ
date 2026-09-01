# Judge Service 2C.6 Migration Matrix V1

| Phase 2C.6 concern | Phase 2C.7A authority |
| --- | --- |
| Redis queue, lease and retry | `@ojplatform/judge-runtime` used by Judge Service and Worker. |
| Judge job/evaluation/attempt result | Judge Service `judge_service_jobs` and `judge_service_evaluations`. |
| Submission evaluation projection | Product `submission_evaluations`, written only by Product repository. |
| Product correlation | Opaque `externalSubmissionId` and returned `judgeJobId`. |
| Rejudge history | New Judge evaluation generation plus immutable prior service projection. |
| Terminal publication | Product adapter consumes a safe Service DTO. |
| Dynamic node registry | Judge-only `judge_nodes` and `judge_node_assignments` from migration `0001_dynamic_judge_node_registry.sql`; no Product schema access. |

Existing deployments without `JUDGE_SERVICE_URL` and `JUDGE_SERVICE_TOKEN`
retain the previously qualified local adapter. Service mode is explicit and is
the standalone deployment path qualified by Phase 2C.7A.
