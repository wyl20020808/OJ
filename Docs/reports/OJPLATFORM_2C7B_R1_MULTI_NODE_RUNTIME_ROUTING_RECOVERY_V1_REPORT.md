# OJPLATFORM Phase 2C.7B-R1 Multi-Node Runtime Routing Recovery V1 Report

## Final Status

`PARTIAL / ENVIRONMENT_BLOCKED`

This is a timeboxed, evidence-preserving recovery result. It fixes the
identified service-mode defects and retains a real Node A C++20 proof from
before the final WSL reset. It does not claim Phase 2C.7B closure because the
required fresh Node B WA and lifecycle regressions were blocked by that WSL
interruption.

## Git

- Baseline: `1da16dcfce24bf6d1644844887f21b17b60002bf`
- Branch: `codex/phase2c7b-r1-runtime-routing-recovery`
- Final HEAD: verified by the post-commit `git rev-parse HEAD` check in the
  final delivery; this report is included by that scoped commit.
- `Docs/PROJECT_STATUS.md` was not changed. No Lead Integration was run.

## Implemented

- Repair of Judge runtime-role grants for existing and future Judge tables and
  sequences when migrations run under an administrative owner.
- Claim/assignment capacity race compensation and current-capacity validation.
- Strict bounded service-mode claim response decoding, lease/incarnation
  binding, and HTTPS-only non-loopback Judge Service transport.
- Assignment-bound Service cancellation observation; cancellation remains
  lease-bound and errors are safely observable without a Redis-prefix fallback.
- Bounded 8 MiB Supervisor execution-set envelope, matching the valid Worker
  maximum payload, with a maximum-payload regression test.
- Updated Judge Service API, node registry, deployment, migration, and Worker
  / Supervisor handoff contracts.

No Product Backend, Web, Project Status, scheduler-policy redesign, advanced
judge feature, or Lead Integration change is included.

## Root Cause

The live Judge runtime role was unable to access administrator-owned
`judge_nodes` objects after migration (`42501 permission denied for table
judge_nodes`). In addition, the Supervisor's former 1 MiB execution-set JSON
limit contradicted the valid Worker maximum request envelope. Both defects are
corrected.

The retained historical Worker log proves claim followed by return to
`CLAIMING` and no execution-set record, but it did not preserve the exact
post-claim HTTP or validation error. This report does not falsely assert a
specific historic transport error. See
`Docs/parallel/JUDGE_2C7B_R1_RUNTIME_ROUTING_ROOT_CAUSE_V1.md`.

## Runtime Evidence

The recovered WSL checks passed and a dedicated Judge Service was brought up
on loopback with isolated Judge dependencies. Before the later WSL interruption
cleared Goal-owned `/tmp` binaries, current-source Node A produced a real
C++20 AC through the Service/Worker/Supervisor path:

- Judge job: `d8d596f8-f6fe-4b01-887b-0f6a5ca31527`
- Assignment: `b3d530a2-99c7-4102-92e5-a7ef80b698af`
- Node: `phase2c7b-r1-node-a`
- Incarnation: `0d850f50110e9e138c95bfbd911bdd0b`
- Supervisor: `PIPELINE_COMPLETED`, one of one testcase completed, cleanup
  verified.

Earlier live setup also established two distinct logical Workers and two
distinct Supervisor endpoints with real C++20 capability, registration, and
heartbeats. Node A was not requalified after the final WSL reset. The fresh
Node B WA, drain/offline routing, unhealthy/re-registration, stale completion,
retry, and full verdict/restart regression were not requalified inside the
finalization timebox. A WSL interruption removed the Goal-owned Supervisor
binary from `/tmp`; this is an environment interruption, not evidence of a
code regression.

## Gates

| Gate | Result |
| --- | --- |
| `pnpm test` | PASS: 358 passed, 5 skipped |
| Focused TypeScript | PASS: 23 passed, 5 Redis-gated skips |
| Redis queue qualification | PASS: 5 of 5 |
| `pnpm test:architecture` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm build` | PASS |
| `pnpm integration` | PASS: 6 passed in recovery gate |
| WSL Worker Go test/vet and focused race | PASS |
| WSL Supervisor Go test/vet | PASS |
| `git diff --check` | PASS |

## JSR1 And Cleanup

The detailed `JSR1-01..90` disposition is in
`Docs/parallel/JUDGE_2C7B_R1_RUNTIME_ROUTING_QUALIFICATION_MATRIX_V1.md`.
At finalization, the exact Goal-owned WSL Worker PIDs `12467` and `12487` and
the dedicated Judge Service were stopped. No Goal-owned Worker, Supervisor,
Judge Service, or listener on `3117`, `3107`, `19193`, `19194`, `28193`, or
`28194` remained. Redis at `127.0.0.1:56379` rejected a connection during
cleanup, so no claim is made that the isolated Redis prefix was removed. The
untracked local runtime binary directories are preserved rather than deleting
workspace artifacts. Unrelated WSL, Product, and user-owned processes were
not touched.

## Final Flags

`RUNTIME ROUTING ROOT CAUSE = IDENTIFIED`

`WORKER -> SUPERVISOR HANDOFF = PASS` for retained Node A real evidence only;
it was not requalified after the final WSL reset.

`REAL NODE A EXECUTION = PASS` (retained evidence only; not requalified after
the final WSL reset)

`REAL NODE B EXECUTION = BLOCKED`

`REAL MULTI-NODE EXECUTION = NO`

`PHASE 2C.7B CLOSURE = NO`

`READY FOR PHASE 2C.7C = NO`

## Limitations

This report does not claim production readiness, HA, multi-machine routing,
autoscaling, contest scoring, special/interactive judging, or a fully closed
Phase 2C.7B. The remaining required real Node B and lifecycle evidence must
be completed in a resumed runtime qualification rather than inferred from
control-plane tests. If assignment cancellation observation is temporarily
unavailable, a running Worker keeps its existing bounded execution deadline
rather than fabricating a cancellation result; the condition is observable.
