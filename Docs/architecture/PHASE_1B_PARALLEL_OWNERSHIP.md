# PHASE 1B Parallel Ownership Matrix

| Owner | Exclusive write scope | Forbidden scope |
| --- | --- | --- |
| Auth/Authz Worker | Auth/User/Authz module implementation and tests under `apps/api/src/modules/auth/**`, `apps/api/src/modules/user/**`, `apps/api/src/modules/authz/**`; migration `0003_authz_foundation*`; own report/context | Problem Authoring/Web, shared contracts, API composition, migration runner, root manifests, `PROJECT_STATUS.md` |
| Problem Authoring Worker | Problem authoring/revision implementation and tests under `apps/api/src/modules/problem/**` (authoring/revision-owned files only); migration `0004_problem_authoring_revision*`; own report/context | Auth/Authz internals, Web, shared contracts, API composition, migration runner, root manifests, `PROJECT_STATUS.md` |
| Web Authoring Worker | `apps/web/**` authoring UI/client/browser tests; own report/context | API internals, database/migrations, shared contracts, root manifests, `PROJECT_STATUS.md` |
| Lead Integration | Root manifests/lockfile, shared contracts, `Docs/PROJECT_STATUS.md`, central API composition/routes, migration runner/registry, CI, cross-module dependency configuration, integration tests, final reports | Worker-exclusive implementation unless explicitly coordinated |

Workers may read all files but must use Integration Requests for Lead-owned changes. `Goals/` remains protected untracked user content.
