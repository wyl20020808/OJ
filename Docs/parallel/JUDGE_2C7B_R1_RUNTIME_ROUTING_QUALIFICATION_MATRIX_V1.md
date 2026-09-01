# Judge 2C.7B-R1 Runtime Routing Qualification Matrix V1

## Status Legend

- `PASS`: executed evidence or focused contract coverage is recorded.
- `PARTIAL`: a real subset passed, but the Goal row is not fully closed.
- `BLOCKED`: a required runtime row could not be completed because of the
  recorded environment interruption.
- `NOT VERIFIED`: the required fresh runtime evidence was not completed.

## Matrix

| JSR1 rows | Status | Evidence |
| --- | --- | --- |
| 01-03 | PASS | Baseline `1da16dcfce24bf6d1644844887f21b17b60002bf`, recovery branch, and recovered WSL `/bin/true` and `/bin/echo WSL_OK` checks. |
| 04-09 | PARTIAL | Retained blocked-path evidence captures claims and `BUSY -> CLAIMING` without a Supervisor record. The exact historic post-claim error was not logged; current ACL and bounded-payload defects were directly found and fixed. |
| 10-18 | PASS | Service/local parity, strict claim response identity/lease validation, generation/capability checks, and capacity-race compensation are covered by focused TypeScript and Go tests. |
| 19-23 | PASS | Per-node loopback Supervisor contract/config validation, non-loopback HTTPS rejection, and distinct endpoint topology requirements are explicit and tested. |
| 24-30 | PASS | New Worker diagnostics expose Supervisor and cancellation-observation failure without source/token leakage; retry, stale claim, duplicate claim, and Product DB isolation semantics remain covered. |
| 31-42 | PASS | Retained service-mode Node A real C++20 AC before the final WSL reset: job `d8d596f8-f6fe-4b01-887b-0f6a5ca31527`, assignment `b3d530a2-99c7-4102-92e5-a7ef80b698af`, node `phase2c7b-r1-node-a`, incarnation `0d850f50110e9e138c95bfbd911bdd0b`; Supervisor record was `PIPELINE_COMPLETED`, one testcase completed, cleanup verified. This was not requalified after the reset. |
| 43-57 | BLOCKED | Earlier live setup proved distinct A/B Workers, Supervisors, registration, heartbeat, and C++20 capability. A fresh Node B scheduler-routed WA plus current-source record was blocked by WSL session teardown and was not completed inside the finalization window. |
| 58-60 | NOT VERIFIED | Full 2C.7A verdict/restart regression was not rerun after the WSL interruption. |
| 61-68 | NOT VERIFIED | Drain/offline real executable routing was not rerun in this timeboxed recovery. |
| 69-76 | NOT VERIFIED | Fresh unhealthy, re-registration, stale completion, and retry/stale runtime sequence was not rerun in this timeboxed recovery. |
| 77 | PASS | Focused TypeScript: 23 passed, 5 Redis-gated skips. |
| 78 | PASS | `pnpm test`: 27 files passed, 358 tests passed, 5 skipped. |
| 79 | PASS | `pnpm integration`: 6 passed in the pre-finalization recovery gate; no related source change followed except Worker diagnostic logging. |
| 80-84 | PASS | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:architecture`, and `pnpm build` all passed during finalization. |
| 85-86 | PASS | WSL Worker `go test ./...`, `go vet ./...`, focused Worker/NodeClient/config tests, and focused `-race` tests passed. |
| 87-88 | PASS | WSL Supervisor `GOFLAGS=-buildvcs=false go test ./...` and `go vet ./...` passed. Windows failures are platform-inapplicable and are not credited. |
| 89 | PASS | `git diff --check` passed. |
| 90 | PARTIAL | The exact Goal-owned Workers and dedicated Service were stopped and no Goal-owned listener remained. Redis at `127.0.0.1:56379` rejected final cleanup, so no Redis-prefix removal is claimed; untracked local runtime binaries were preserved. No unrelated WSL or user-owned process was removed. |

## Outcome

`REAL NODE A EXECUTION = PASS`

`REAL NODE B EXECUTION = BLOCKED`

`REAL MULTI-NODE EXECUTION = NO`

`PHASE 2C.7B CLOSURE = NO`

`READY FOR PHASE 2C.7C = NO`

This matrix is intentionally `PARTIAL / ENVIRONMENT_BLOCKED`: the
finalization timebox did not permit substituting prior control-plane proof for
the remaining required real Node B and lifecycle qualification.
