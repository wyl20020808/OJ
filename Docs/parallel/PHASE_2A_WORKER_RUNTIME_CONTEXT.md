# Phase 2A Worker Runtime Context

Branch: `codex/phase2a-worker-runtime`. Starting baseline is the common Phase 2A bootstrap commit recorded by Lead.

Implement the independent Go Worker process only after Bootstrap: public `2A.1` request/result handling, Redis queue consumption through the approved boundary, stable worker ID/fresh instance ID, bounded concurrency, safe heartbeats, graceful drain, lease-aware result submission, deterministic safe fixtures, cancellation observation, lifecycle and tests.

No Application PostgreSQL connection, source compilation/execution/eval/shell/import, compiler/interpreter launch, Sandbox, arbitrary command/path/environment, real verdicts, Auth internals, Web, migrations, root dependency changes, or shared contract edits. `REAL_SANDBOXED_EXECUTION` must reject.
