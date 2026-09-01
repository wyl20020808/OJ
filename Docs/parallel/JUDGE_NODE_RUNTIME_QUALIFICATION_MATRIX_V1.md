# Judge Node Runtime Qualification Matrix V1

This matrix defines the required Phase 2C.7B runtime evidence. The harness
`scripts/phase2c7b-dynamic-node-qualification.mjs` requires externally
pre-started Judge Service, Supervisor, and Workers. It starts no process and
does not turn an absent routing observation into a pass.

| Evidence | Required observation |
| --- | --- |
| JSNODE-71..74 | Two distinct node IDs/incarnations heartbeat and appear in the registry; record whether both are real Workers. |
| JSNODE-75..76 | A real C++20 job completes through the scheduler, with independent assignment/node evidence for second-node routing. |
| JSNODE-77 | Drain A prevents new assignment to A and permits B routing. |
| JSNODE-78 | Withheld heartbeat makes A `UNHEALTHY` after configured timeout. |
| JSNODE-79..81 | A re-registers under a new incarnation; old heartbeat and completion are rejected. |
| JSNODE-82 | Offline B receives no new job. |
| JSNODE-83..91 | Re-run the applicable 2C.7A standalone, AC/WA/CE/RE/TLE/MLE/cancel/rejudge-history regressions. |
| JSNODE-92..97 | TypeScript/integration/Go/format/lint/typecheck/architecture/build and diff/skip audit pass. |
| JSNODE-98..100 | Goal-owned runtime, Redis keys, and runc residue are cleaned; permanent artifacts exist; final scoped commit leaves tracked worktree clean. |

Preferred topology is two real logical execution nodes on one host, each with
distinct Worker/Supervisor process identity, node ID, incarnation, capacity,
and heartbeat. One real Worker plus a simulated control-plane node is allowed
only with `REAL MULTI-NODE EXECUTION = PARTIAL`; it cannot be reported as full
multi-node execution. Product API need not run, and Product database direct
access remains prohibited.

The permanent report records commands, actual topology, raw safe observations,
cleanup, and any `PARTIAL` or `BLOCKED` result. It distinguishes implemented,
tested, runtime verified, and not verified.
