# Unified Product Judge Migration Matrix V1

Product and Judge persistence remain separate databases.

| Database | Required migration coverage | Runner | Evidence | Result |
| --- | --- | --- | --- | --- |
| Product | `0000` through `0016`, including Judge Admin audit, Judge Data, exact JudgeDataVersion binding (`0015`) and Submission Detail (`0016`) | `scripts/migrate.mjs` | `pnpm db:migrate` | PASS |
| Judge | Existing Judge state plus `0002_judge_admin_state.sql` and `0003_judge_pool_control.sql` | `scripts/judge-service-migrate.mjs` | Fresh `ojplatform_judge_unified_runtime_20260902` bootstrap | PASS |

The Judge runner discovers and sorts Judge migrations independently. The Product runner has an explicit ordered Product migration list. Neither runner targets the other database.
