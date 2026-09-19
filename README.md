# OJPlatform

Status: **Pre-development / Architecture Foundation**.

OJPlatform aims to become a modern Online Judge that can evolve safely over the long term, execute untrusted code securely, scale horizontally, and support a plugin ecosystem.

The current architecture source of truth is [Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md](Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md). Formal business development has not started. Future work is driven by phased goals.

Developers and coding agents must read `AGENTS.md` before making changes. Current phase state, deferred work, and the next action are summarized in [Docs/OJPLATFORM_CURRENT_HANDOFF.md](Docs/OJPLATFORM_CURRENT_HANDOFF.md).

Current project status is tracked in [Docs/PROJECT_STATUS.md](Docs/PROJECT_STATUS.md). Goal reports live under [Docs/reports](Docs/reports), and architecture decisions under [Docs/adr](Docs/adr).

## Production deployment

Clone with submodules so the pinned OnlineCodeEditor plugin is present:

```sh
git clone --recurse-submodules <OJPlatform remote>
```

See [Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md](Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md). After cloning and filling `.env` (from `.env.production.example`):

```sh
docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
sudo ./deploy/judge-host/install.sh
```

Docker Compose owns every container. The host script provisions only the
host-native execution cell (Supervisor, Worker, Host Agent, compiler rootfs).
