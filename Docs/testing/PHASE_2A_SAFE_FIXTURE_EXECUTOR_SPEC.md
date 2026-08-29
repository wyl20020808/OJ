# Phase 2A Safe Fixture Executor Specification

The safe fixture executor is internal deterministic qualification plumbing, not a language runtime or Sandbox. Fixture selection comes only from validated Coordinator-controlled `fixture_id`; submission source is opaque inert provenance and never influences fixture behavior.

| Fixture | Deterministic bounded behavior | Result |
|---|---|---|
| `FX-SUCCESS` | bounded in-process bookkeeping | `SAFE_FIXTURE_SUCCEEDED` |
| `FX-RETRYABLE` | bounded controlled protocol failure | `SAFE_FIXTURE_FAILED_RETRYABLE` |
| `FX-TERMINAL` | bounded controlled terminal protocol failure | `SAFE_FIXTURE_FAILED_TERMINAL` |
| `FX-SLOW` | bounded delay with heartbeat/cancel checkpoints | success unless cancelled |
| `FX-CANCEL` | waits only for bounded cooperative cancellation checkpoint | `CANCELLED` when cancelled; bounded safe outcome otherwise |
| `FX-CRASH-BOUNDARY` | optional harness-owned process boundary; never production behavior | no result; lease recovery is tested |

Each fixture has a Lead-frozen maximum duration; no fixture creates an unbounded loop. It must not inspect/execute/import source, invoke a compiler/interpreter/shell, launch a subprocess, dynamically load user code, or cause arbitrary source-driven filesystem/network effects. Same fixture and controlled metadata produce the same outcome.
