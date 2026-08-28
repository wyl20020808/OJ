# PHASE 1E-R Runtime Lifecycle Plan

Lead starts PostgreSQL, Redis and MinIO exactly once with `pnpm infra:up -d` and verifies them with `pnpm infra:wait` before migrations/API/browser work. The Lead owns the WSL2 Ubuntu 24.04 keepalive and must maintain it for the entire qualification session. Lead owns API and Web process lifetime and records their PIDs.

Playwright starts only after dependencies, migrations, API and Web are ready. No worker, test helper, shell scope, or Playwright web-server hook may run `infra:down`, compose down, Docker stop, or terminate shared API/Web processes while a browser run is active. Only the Lead may teardown, after both Playwright runs, all failure injection, and final evidence capture complete.

Before each run, Lead records `docker compose ps`, readiness endpoints, and listening API/Web ports. After each run, Lead checks `docker compose ps`, Docker events/logs, and `Get-NetTCPConnection`/tracked PIDs for orphaned services. On unexpected dependency exit, stop the affected qualification immediately, capture exit code/logs/events, classify it as runtime lifecycle failure, and restart only under Lead control. Final cleanup runs once, after reports are written: stop tracked API/Web processes, `pnpm infra:down`, then verify no containers or listener orphans remain.

