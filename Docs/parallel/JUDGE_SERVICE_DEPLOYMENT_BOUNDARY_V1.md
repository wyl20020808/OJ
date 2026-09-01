# Judge Service Deployment Boundary V1

Start only the Judge Service after applying its independent migration:

```powershell
$env:JUDGE_DATABASE_URL = '<judge-only database URL>'
$env:JUDGE_REDIS_URL = 'redis://127.0.0.1:56379'
$env:JUDGE_REDIS_PREFIX = 'oj:judge:service'
$env:JUDGE_SERVICE_TOKEN = '<rotatable service secret>'
$env:JUDGE_NODE_TOKEN = '<separate rotatable node secret>'
$env:JUDGE_NODE_UNHEALTHY_TIMEOUT_MS = '15000'
pnpm --filter @ojplatform/judge-service dev
```

`JUDGE_SERVICE_HOST` defaults to `127.0.0.1`; `JUDGE_SERVICE_PORT` defaults to
`3100`. The process requires Judge PostgreSQL and Redis plus the existing
Worker/Supervisor and its qualified testdata/compiler runtime. It does not
require Web or Product API. Apply migrations with:

```powershell
$env:JUDGE_DATABASE_URL = '<judge-only database URL>'
$env:JUDGE_DATABASE_ROLE = '<runtime Judge role name>'
node scripts/judge-service-migrate.mjs up
```

`JUDGE_NODE_TOKEN` is required, must differ from `JUDGE_SERVICE_TOKEN`, and
is used only by registered Workers. Each Worker configured with
`JUDGE_SERVICE_URL` registers its stable `WORKER_ID`, a fresh process
incarnation, capacity, and frozen capabilities; it then receives assignments
from the service rather than claiming the global Redis queue directly. Local
qualification may use an `http` loopback URL. A non-loopback
`JUDGE_SERVICE_URL` must use `https` because the Worker sends its node
credential on each node-control request.

The service environment must not contain Product database credentials. For
local qualification, `scripts/judge-service-bootstrap.mjs` creates a dedicated
database and least-privilege role from an administrator connection supplied at
runtime. When migrations run as an administrative owner rather than the
runtime role, set `JUDGE_DATABASE_ROLE` for the migration command so it grants
the runtime role access to existing and future Judge tables. Production
deployment should use managed secret injection and upgrade the V1 token
boundary to a stronger service identity such as mTLS.

This is a dynamic node-registry control plane, not an HA or autoscaling
deployment. Cloud provisioning, multi-machine failover, contest scoring, SPJ,
interactive judging and additional languages are not part of this deployment.
