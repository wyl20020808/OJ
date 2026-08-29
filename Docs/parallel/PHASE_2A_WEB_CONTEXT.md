# Phase 2A Web Context

Branch: `codex/phase2a-worker-ops-ui`. Starting baseline is the common Phase 2A bootstrap commit recorded by Lead.

Implement only server-backed execution-stage and Worker operational UX permitted by the public API: owner view, authorized operator diagnostics if exposed, offline/degraded states, synthetic-only wording, cancellation UX if the API contract is integrated, responsive and accessibility tests.

Do not connect directly to Worker or Redis, expose worker IDs beyond approved public projection, expose secrets/raw lease tokens/source, fabricate real verdicts, modify Auth internals, Go runtime, queue, shared contracts, migrations, root dependencies, or project status.
