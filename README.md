# OJPlatform

Status: **Pre-development / Architecture Foundation**.

OJPlatform aims to become a modern Online Judge that can evolve safely over the long term, execute untrusted code securely, scale horizontally, and support a plugin ecosystem.

The current architecture source of truth is [Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md](Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md). Formal business development has not started. Future work is driven by phased goals.

Developers and coding agents must read `AGENTS.md` before making changes. Current phase state, deferred work, and the next action are summarized in [Docs/OJPLATFORM_CURRENT_HANDOFF.md](Docs/OJPLATFORM_CURRENT_HANDOFF.md).

Current project status is tracked in [Docs/PROJECT_STATUS.md](Docs/PROJECT_STATUS.md). Goal reports live under [Docs/reports](Docs/reports), and architecture decisions under [Docs/adr](Docs/adr).

## Production deployment

On a fresh Ubuntu x86_64 host, one command:

```sh
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

The installer checks the host, installs Docker from the official repository when
it is missing, initialises the pinned OnlineCodeEditor submodule, generates the
production secrets once, starts the standard production Compose stack, waits for
real service health, and then provisions the host-native Judge execution cell.

It never needs Node, pnpm or Go on the host: the execution-cell binaries are
compiled in a pinned Go builder container and the Web image installs the plugin
dependencies itself.

Diagnose an existing deployment (read-only):

```sh
sudo ./deploy/doctor.sh
```

Update an existing deployment:

```sh
git pull --ff-only
git submodule update --init --recursive
sudo ./deploy/install.sh
```

### Manual / advanced path

The two documented commands remain fully supported:

```sh
docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
sudo ./deploy/judge-host/install.sh
```

Docker Compose owns every container; the host scripts provision only the
host-native execution cell (Supervisor, Worker, optional Host Agent, compiler
rootfs). See [Docs/deployment/ONE_COMMAND_DEPLOYMENT.md](Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)
and [Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md](Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md).
