# PHASE 1A Parallel Ownership Matrix

Bootstrap commit freezes these boundaries for `OJPLATFORM-1A-CORE-PRODUCT-FOUNDATION`.

| Owner | Exclusive write scope | Forbidden scope |
| --- | --- | --- |
| Worker A Auth | `apps/api/src/modules/auth/**`, `apps/api/src/modules/user/**`, Auth/User public tests, `0001_auth_foundation.sql` and down migration, and worker report/context updates | Problem/Web files, shared contracts, API composition, route registry, migration runner, `PROJECT_STATUS.md`, root manifests |
| Worker B Problem | `apps/api/src/modules/problem/**`, Problem public tests, `0002_problem_foundation.sql` and down migration, and worker report/context updates | Auth/Web files, shared contracts, API composition, route registry, migration runner, `PROJECT_STATUS.md`, root manifests |
| Worker C Web | `apps/web/**`, Web/client/browser tests, and worker report/context updates | API internals, database/migrations, shared contracts, `PROJECT_STATUS.md`, root manifests |
| Lead Integration | `package.json`, `pnpm-lock.yaml`, `AGENTS.md`, shared contracts, `Docs/PROJECT_STATUS.md`, central API composition/bootstrap, central route registry, migration runner/registry, shared CI, cross-module dependency config, integration plan/requests | Worker-exclusive implementation files unless an integration change is explicitly coordinated |

All workers may read repository files. A worker needing a Lead-owned change records an Integration Request instead of editing it. `Goals/` is protected untracked user content and remains untouched.
