# Judge Production Deployment

## Qualification status

Production hardening and WSL2 production-like prequalification are complete. Native Linux amd64 qualification is pending; therefore Production Judge is **not qualified**. Linux ARM64 is not qualified. macOS Judge is not a target.

## Architecture

```text
Docker: Web -> API -> Judge Service -> Judge PostgreSQL + Redis ACL
Host:   optional Host Agent -> Worker -> 127.0.0.1:19092 Supervisor -> rootless runc
```

Only Web has public ingress. Judge Service may publish only on host loopback for a same-host Worker. API, PostgreSQL, Redis, and MinIO remain private. Worker and Supervisor are native Linux services; never mount Docker socket or use host PID/network to containerize them.

## Host requirements

- Native Linux amd64; kernel >= 6.8 with user/PID/mount/network/IPC/UTS namespaces, seccomp, and cgroup v2.
- systemd >= 255 with lingering dedicated user manager and delegated cpu/memory/pids.
- runc >= 1.4.3, OCI >= 1.3, libseccomp >= 2.5.5.
- Local ext4/xfs-style filesystem with Unix owner/mode/symlink/atomic-rename semantics and monitored free space.
- Docker Engine + Compose plugin for trusted control-plane operator only.
- Pinned C++ rootfs profile `cpp20-gcc-13-v1`; sufficient CPU/RAM/disk for configured concurrency.
- Private TLS connectivity when Judge Service or artifact API is off-host. Plaintext non-loopback Supervisor is forbidden.

## Runtime user matrix

| Identity | Runs | Required access | Forbidden |
| --- | --- | --- | --- |
| Docker `ojplatform` | Judge Service/migrations | Judge DB/Redis; migration jobs additionally migration role | Product DB in Judge Service, Docker socket, host paths |
| trusted Docker operator | Compose and offline rootfs build/install | Docker daemon; controlled deployment paths | untrusted execution |
| Host Agent user | fixed Worker templates and owned child state | local process control for owned Workers | DB, Docker socket, arbitrary UI command |
| Worker user | Worker | Judge Service, Worker Redis ACL, artifact read API, loopback Supervisor | PostgreSQL, MinIO secret, Docker daemon |
| `oj-sandbox` | Supervisor/runc | user bus, delegated cgroup, verified rootfs, private workspace | docker/sudo/disk groups, Docker socket/API, DB/Redis/S3 credentials |
| sandbox guest | compiler/submission | private mounted rootfs/workspace only | host/control-plane network, credentials, siblings, Docker |

`oj-sandbox` must have only its primary group. Verify with a fresh login process, not a stale shell.

## Production environment matrix

Values come from a secret manager, protected environment file, or Compose secret file. Never commit or print values.

| Variable | Consumer | Secret | Required | Source/scope |
| --- | --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | PostgreSQL bootstrap | yes | yes | deployment-only admin |
| `PRODUCT_RUNTIME_DB_PASSWORD` | PostgreSQL bootstrap | yes | yes | Product runtime role |
| `PRODUCT_MIGRATION_DATABASE_URL` | Product migration | yes | yes | one-shot migration role |
| `PRODUCT_RUNTIME_DATABASE_URL` | API | yes | yes | Product runtime only |
| `REDIS_*_USERNAME/PASSWORD` | ACL bootstrap/runtime roles | password yes | yes | distinct admin/Product/Judge/Worker/health identities |
| `MINIO_ROOT_USER/PASSWORD` | MinIO | yes | yes | storage administrator |
| `S3_ACCESS_KEY/SECRET_KEY/BUCKET` | API | yes except bucket | yes | Product object storage only |
| `JUDGE_DATABASE_ADMIN_URL` | Judge bootstrap | yes | yes | one-shot DB admin |
| `JUDGE_DATABASE_PASSWORD` | Judge bootstrap | yes | yes | Judge runtime role creation |
| `JUDGE_MIGRATION_DATABASE_URL` | Judge migration | yes | yes | one-shot migration role; not runtime role |
| `JUDGE_RUNTIME_DATABASE_URL` | Judge Service | yes | yes | Judge runtime DB only |
| `JUDGE_SERVICE_TOKEN` | API/Judge Service | yes | yes | service protocol |
| `JUDGE_NODE_TOKEN` | Judge Service/Workers | yes | yes | node protocol; distinct from service token |
| `REDIS_URL` | Worker | yes | yes today | Worker ACL URL only; no queue/admin access |
| artifact/Supervisor tokens | Worker/API/Supervisor | yes | when enabled | distinct scoped identities |
| `OJPLATFORM_*_IMAGE` | Compose | no | recommended | immutable release tag/digest |
| `OJPLATFORM_WEB_PORT` | Web | no | no | public ingress selection |
| `OJPLATFORM_JUDGE_SERVICE_PORT` | Judge Service | no | no | loopback only |

Production overlay uses `${VAR:?message}` gates for required values. Judge Service also supports exclusive `_FILE` providers and rejects missing, short, equal, or ambiguous tokens. Development defaults in base Compose are overridden; production must never run base Compose alone.

## Provisioning

1. Install patched host prerequisites and create trusted Docker operator.
2. Create `oj-sandbox` without supplementary privileged groups. Enable linger/user bus and delegated cgroup controllers.
3. Create root-owned Supervisor/Worker binary and config locations; do not make trusted binaries world-writable.
4. Build compiler rootfs from `scripts/phase2c1-compiler-rootfs.Dockerfile`, whose Ubuntu base is digest-pinned and compiler packages are version-pinned.
5. Run `scripts/phase2c1-prepare-compiler-rootfs.sh` as trusted root. Record image metadata, package list, compiler version, content manifest, and identity. Deploy by immutable release artifact where possible; do not rebuild from `latest` on production hosts.
6. Verify rootfs `root:root`, directories/files non-writable, identity/manifest/compiler command hash exact. Keep the previous complete rootfs plus sidecars for rollback.
7. Install native Supervisor/Worker units. Supervisor binds `127.0.0.1:19092` only and runs as `oj-sandbox`.
8. Prepare a protected production env/secret source. Use distinct generated credentials.
9. Render and inspect Compose before startup:

```bash
docker compose --env-file /run/secrets/ojplatform.env \
  -f compose.yaml -f compose.prod.yaml --profile judge config
pnpm qualify:production-judge-config
```

10. Start control plane:

```bash
docker compose --env-file /run/secrets/ojplatform.env \
  -f compose.yaml -f compose.prod.yaml --profile judge up -d
```

11. Start Supervisor, verify execution preflight, then Worker/Host Agent. Compose health alone is not execution readiness.

## Health and readiness

- Judge Service `/health`: process liveness.
- Judge Service `/ready`: Judge DB + Redis dependency readiness.
- Authenticated `/v1/execution-readiness`: `ONLINE`, `EXECUTION_READY`, `DEGRADED`, or `UNAVAILABLE` from dependency checks and durable node records.
- Worker `/ready`: current Judge Service, Redis, and Supervisor checks.
- Supervisor health/preflight: non-root identity, user bus, runc, cgroup delegation, rootfs integrity, workspace and cleanup capability.

Only `EXECUTION_READY` plus successful Worker/Supervisor preflight authorizes scheduling. Execution repeats preflight and fails closed.

## Security checks

- `docker compose config`: only Web public; Judge Service `127.0.0.1`; no private service publication.
- `docker inspect`: Judge Service non-root, read-only rootfs, cap-drop ALL, no-new-privileges, no host PID/network, no devices/socket.
- `id -nG oj-sandbox`: primary group only. Fresh process Docker socket/API denial mandatory.
- Redis: default user disabled; role ACLs distinct; no production host port.
- DB: Product/Judge credentials separated; runtime roles have no role/database creation and no schema DDL.
- Sandbox: dual-opt-in bounded qualification; no real Submission or public exploit.
- Logs: no URL userinfo, authorization headers, tokens, source/testcase secrets, or environment dumps.

## File ownership

| Path/artifact | Owner/mode contract |
| --- | --- |
| compiler rootfs | `root:root`; root directory 0555; no writable non-symlink content |
| identity/manifest/version sidecars | `root:root`, 0644, exact content hash contract |
| Supervisor/Worker binaries and units | trusted root/operator; non-world-writable |
| Supervisor records/staging/workspaces | `oj-sandbox`, private 0700/0600; ownership metadata required |
| Host Agent state | Host Agent user, 0600 |
| production env/secret files | deployment identity/root, 0600 or secret-manager mount |
| container rootfs | read-only where declared; writable `/tmp` only |
| logs | journald/Docker-owned; sandbox cannot write trusted logs |

## Limits and storage

Compile: NOFILE 128, FSIZE 16 MiB, workspace 32 MiB aggregate monitor, 64 MiB free-space admission reserve, artifact 16 MiB, memory 512 MiB, PIDs 64, wall 10 s. Runtime: NOFILE 64, FSIZE 512 KiB, 1 MiB tmpfs workspace, memory 64 MiB, PIDs 16, wall 2 s. Both have finite CPU/output and verified cleanup.

The aggregate compile quota is compensated, not kernel-project-quota qualified. Use dedicated local workspace storage, alert on free space, and cap concurrency. Never test by filling production disk or inducing host OOM.

## Logging and retention

Production Compose uses `json-file` rotation: 10 MiB x 5 files per long-lived service. Native units must use journald with deployment-defined retention/size caps. Workspace/source/testcase/artifact copies are attempt-scoped and removed after success, failure, timeout, crash recovery, or cancellation. Durable Judge results live in databases/object storage, not workspaces.

## Operations

- **Second startup:** bootstrap/migrations are idempotent and must complete again without ACL reset or identity drift.
- **Judge Service restart:** Worker reconnects; durable jobs/leases remain authoritative.
- **Redis restart:** ACL file remains active from process start; no unauthenticated window. Clients reconnect.
- **Worker restart:** use a new host-owned incarnation; stale incarnation/lease completion is rejected.
- **Supervisor restart:** in-flight records recover as infrastructure failure; owned residue cleanup must verify exact ownership; ambiguity fails closed.
- **Low disk/memory:** refuse new execution through preflight/admission; do not rely on host OOM or disk-full behavior.

## Upgrade and rollback

1. Drain Workers; allow active attempts to finish or fail closed.
2. Back up databases and required object metadata; capture current image/rootfs identities.
3. Pull/build immutable versioned images and rootfs off the execution path.
4. Render config and run migration plan/status. Apply one-shot migrations before runtime service.
5. Restart control plane, Supervisor, then Workers; run readiness and bounded security gates.
6. Roll back application images and complete rootfs artifact together. Never rewrite applied migrations; use forward repair when schema compatibility prevents binary rollback.

## Data recovery boundary

- Product PostgreSQL: Submission/product authority; restore using Product DB backup procedure.
- Judge PostgreSQL: jobs, node/incarnation, assignments, durable results; back up and restore independently.
- Redis: ACL file/config is deployment state; queue/cache entries are coordination data and must be reconstructable from durable DB state. Do not treat Redis as result authority.
- MinIO: immutable JudgeData/artifacts and Product objects; preserve object versions/checksums according to retention policy.

Full disaster-recovery rehearsal is outside Phase 6B-6, but ownership above is mandatory.

## Qualification

Run `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` on a disposable native Linux amd64 host. WSL2 evidence is prequalification only and cannot set `PRODUCTION_JUDGE_QUALIFIED=YES`.
