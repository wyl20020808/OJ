# Phase 2A Authz Context

Branch: `codex/phase2a-worker-authz`. Starting baseline is the common Phase 2A bootstrap commit recorded by Lead.

Implement only Worker diagnostic visibility authorization, operator control/cancellation authorization if exposed by the frozen public API, safe capability visibility, attributable audit hooks, and tests. Enforce server-side default deny; unrelated users must not view Job/source/internal worker metadata. Audit records exclude source, credentials, raw lease tokens, and secrets.

Do not implement Go Worker runtime, Redis claim/lease logic, source execution, Sandbox, Web, migrations, root dependencies, shared contracts, or project status. Record shared needs in `PHASE_2A_INTEGRATION_REQUESTS.md`.
