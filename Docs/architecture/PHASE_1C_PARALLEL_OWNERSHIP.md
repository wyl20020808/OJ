# PHASE 1C Parallel Ownership Matrix

| Worker | Exclusive write scope | Forbidden |
| --- | --- | --- |
| Auth | Auth/Authz public submission authorization, ownership policy, audit policy, and its tests/report | Problem internals, Web, shared contracts, API composition, migration runner/registry, root manifests, `PROJECT_STATUS` |
| Problem | Submission domain, validation, repository, service, API module and tests; migration `0005_submission_intake.sql` and `.down.sql` only | Auth internals, Web, shared contracts, central composition, migration registry/runner, root manifests, `PROJECT_STATUS` |
| Web | Submission UI, typed client usage, history/detail views, browser tests and report under `apps/web/**` | API internals, database/migrations, Auth/Problem internals, shared contracts, root manifests, `PROJECT_STATUS` |
| Lead | Shared contract, ownership/context docs, migration registry/runner, central API/route composition, cross-module adapters, CI, `PROJECT_STATUS`, integration and final report | Worker-only implementation while the wave is in progress |

Migration allocation is reserved as `0005_submission_intake.sql` plus `0005_submission_intake.down.sql`, owned exclusively by the Problem worker. Only Lead may register or reorder migrations.

Workers record any required shared-file change in `Docs/parallel/PHASE_1C_INTEGRATION_REQUESTS.md` and their permanent report; they do not edit the shared file directly.

