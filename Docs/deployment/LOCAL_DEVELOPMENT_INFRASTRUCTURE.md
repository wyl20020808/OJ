# Local Development Infrastructure

This guide is for the project-owned development stack only. It is not a production deployment guide.

The intended local container backend is WSL2 Ubuntu with the official Docker Engine and Compose plugin. Docker Desktop is not the canonical backend after PHASE 0B.3R2. This backend switch is not yet runtime-qualified; current setup is blocked by WSL recovery. Node/pnpm remain required from the environment baseline.

```text
pnpm install --frozen-lockfile
pnpm infra:up
pnpm infra:wait
pnpm db:migrate
pnpm infra:status
pnpm integration
pnpm infra:down
```

The Compose project is `ojplatform-local` and binds services to localhost ports 55432 (PostgreSQL), 56379 (Redis), and 59000/59001 (MinIO API/console). Credentials in `.env.example` are development-only defaults. `pnpm infra:reset-test` removes only the named project volumes and is not a general Docker prune operation.
