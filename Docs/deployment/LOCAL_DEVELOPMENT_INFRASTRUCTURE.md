# Local Development Infrastructure

This guide is for the project-owned development stack only. It is not a production deployment guide.

The canonical local container backend is WSL2 Ubuntu 24.04 with the official Docker Engine and Compose plugin. Docker Desktop is not the canonical backend after PHASE 0B.3R2. Windows scripts use a narrow `wsl.exe -d Ubuntu-24.04 -- docker ...` bridge; Docker TCP is not exposed. Node/pnpm remain required from the environment baseline.

```text
pnpm install --frozen-lockfile
pnpm infra:up
pnpm infra:wait
pnpm db:migrate
pnpm infra:status
pnpm integration
pnpm infra:down
```

The Compose project is `ojplatform-local` and publishes services on ports 55432 (PostgreSQL), 56379 (Redis), and 59000/59001 (MinIO API/console) from WSL. Credentials in `.env.example` are development-only defaults. `pnpm infra:reset-test` removes only named project volumes. Windows-to-WSL port forwarding remains environment-dependent and is tracked in the 0B.3R2 report.
