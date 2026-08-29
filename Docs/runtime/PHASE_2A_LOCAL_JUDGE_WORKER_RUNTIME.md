# Phase 2A Local Judge Worker Runtime

Local topology is `Web -> API -> PostgreSQL/Redis/MinIO`; the independent Go Judge Worker consumes the Redis Judge Queue through the public protocol. A qualification harness is Lead-owned and supplies only control-owned fixture IDs. The Worker has no PostgreSQL connection and does not require MinIO in Bootstrap.

Planned startup order is infrastructure, migrations/API, Worker, Web, then qualification harness. The Worker executable is the backend-owned Go build artifact; its config contains a Redis connection reference, stable worker ID, bounded concurrency, heartbeat/liveness values, supported protocol version, build version, and explicit qualification mode. It contains no user source, shell/runtime command, application DB credential, session material, or arbitrary environment map.

Worker readiness is internal/local only: valid config, Redis connected, protocol/capability manifest valid, and heartbeat publication possible. A health endpoint, if later added, binds localhost only and exposes health/status only, never execution control. Logs use a scoped process log; Lead uses tracked PID and graceful signal shutdown, never a broad process kill.

Reuse the Phase 1E WSL keepalive and stable localhost forwarding when required. Lead owns Redis/PostgreSQL/MinIO/API/Web lifecycle. Worker shutdown must stop claims, drain bounded work, and exit without stopping shared infrastructure. Multi-instance qualification starts separately identified processes and performs bounded cleanup after evidence capture.
