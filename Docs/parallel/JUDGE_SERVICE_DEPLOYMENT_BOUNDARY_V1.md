# Judge Service Deployment Boundary V1

Start only the Judge Service after applying its independent migration:

```powershell
$env:JUDGE_DATABASE_URL = '<judge-only database URL>'
$env:JUDGE_REDIS_URL = 'redis://127.0.0.1:56379'
$env:JUDGE_REDIS_PREFIX = 'oj:judge:service'
$env:JUDGE_SERVICE_TOKEN = '<rotatable service secret>'
pnpm --filter @ojplatform/judge-service dev
```

`JUDGE_SERVICE_HOST` defaults to `127.0.0.1`; `JUDGE_SERVICE_PORT` defaults to
`3100`. The process requires Judge PostgreSQL and Redis plus the existing
Worker/Supervisor and its qualified testdata/compiler runtime. It does not
require Web or Product API. Apply migrations with:

```powershell
$env:JUDGE_DATABASE_URL = '<judge-only database URL>'
node scripts/judge-service-migrate.mjs up
```

The service environment must not contain Product database credentials. For
local qualification, `scripts/judge-service-bootstrap.mjs` creates a dedicated
database and least-privilege role from an administrator connection supplied at
runtime. Production deployment should use managed secret injection and upgrade
the V1 token boundary to a stronger service identity such as mTLS.

This is a single-node control plane. Dynamic worker registration, health-based
scheduling, node failover, HA, contest scoring, SPJ, interactive judging and
additional languages are not part of this deployment.
