# PHASE 1D Parallel Ownership Matrix

| Worker | Exclusive scope | Forbidden scope |
| --- | --- | --- |
| Auth | Profile/account product capabilities, current-user/account model, safe roles/capabilities, session/account APIs where foundation permits, account-state semantics/tests | Web UI, social login, MFA, email verification, Problem/backend, shared contract, root files, `PROJECT_STATUS` |
| Backend | Home/problemset/problem-detail product data APIs/read models, real search/filter/pagination, problem metadata, approved submission-read data boundaries | Auth internals, source execution, fake statistics, Web UI, shared contract, central composition, migration registry, root files, `PROJECT_STATUS` |
| Web | Design system, shell/nav/home/auth/problem/profile/account/authoring/submission UI, responsive/a11y, browser and visual evidence | API internals, DB/migrations, Auth/Problem internals, shared contract, root files, `PROJECT_STATUS` |
| Lead | Shared contracts, page/data standards, root deps/lockfile, central composition, migrations, `PROJECT_STATUS`, runtime/E2E/visual qualification and closure | Worker-only feature implementation during the wave |

No new migration is allocated for Bootstrap: current UI requirements are covered by existing public APIs and schema. A future data requirement must receive a Lead decision and, if necessary, the next migration slot after `0005`, owned by one worker only.

