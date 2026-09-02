# Unified Judge Runtime Integration Matrix V1

| Area | Integrated authority | Evidence | Result |
| --- | --- | --- | --- |
| Product/Web baseline | `4df8c2c08d6e651a8e57057f60ba9a3b762a975d` | First parent of merge `d4e04ca` | PRESERVED |
| Host Agent/Pool baseline | `4462fbd8ae85ac82b327a7b642a96d4f761245c7` | Second parent of merge `d4e04ca` | PRESERVED |
| Common base | `e8b1db6298d5800ca8a45de39b8231a9f4373c4b` | `git merge-base` | RECORDED |
| Formal history integration | `d4e04ca` | `git merge --no-ff --no-commit 4462fbd`, then commit | PASS |
| Merge conflicts | None | Git automatic merge completed without conflicts | PASS |
| 3D Product dispatch | Exact JudgeDataVersion binding and Product-to-Judge bridge | Focused and full tests | PASS |
| 3D.1 Submission Detail | Durable selected-generation safe per-testcase projection | Focused and full tests | PASS |
| Host Agent | Trusted templates, detached/unref Worker process, fail-closed persisted PID reconciliation | Host Agent focused tests | PASS |
| Judge Pool | MANUAL/AUTOMATIC policy, capacity, lifecycle and autoscaler | Focused and full tests | PASS |
| Product Judge Admin | Product-only lifecycle adapter, RBAC, CSRF, idempotency and audit | Focused tests | PASS |
| Judge Machines UI | Pool mode, Add/Drain/Enable/Offline/Stop/Restart controls | Focused Web tests | PASS |
| Deferred Product gaps | Global evaluation list backend; explicit problem capability projection | No implementation introduced | PRESERVED DEFERRED |

No manual cross-worktree file copying or commit guessing was used. Product Submission/Detail semantics remain the later authority; Host Agent/Pool safety semantics remain the 2C.8D authority.
