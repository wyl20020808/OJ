# Native Linux Judge Qualification Handoff

This checklist is self-contained. Use a disposable, dedicated, non-WSL native Linux amd64 VM/host. Do not run against user data or a shared production runtime.

## 1. Host evidence

Record outputs without secrets:

```bash
uname -a
cat /etc/os-release
uname -m
systemd-detect-virt || true
systemctl --version | head -1
stat -fc %T /sys/fs/cgroup
cat /sys/fs/cgroup/cgroup.controllers
runc --version
findmnt -no TARGET,FSTYPE,OPTIONS / /tmp /opt/ojplatform
```

Required: native/non-WSL `x86_64`, kernel >=6.8, cgroup v2, systemd >=255, runc >=1.4.3, OCI >=1.3, libseccomp >=2.5.5, local Unix filesystem. Set:

```text
NATIVE_LINUX_AMD64_QUALIFICATION_HOST = YES
```

Otherwise stop final qualification and keep Production Judge NO.

## 2. Fresh clone and isolation

- Clone reviewed Phase 6B-6 commit into a new path.
- Confirm `git status --short` empty and record `git rev-parse HEAD`.
- Choose a unique Compose project, ports, DBs, Redis identities/prefix, directories, systemd units, and test IDs.
- Confirm no shared Worker/Supervisor/Host Agent or user Submission/database participates.
- Prepare cleanup commands for only these exact resources. Never prune Docker globally.

## 3. Secrets and Compose

Create a root/deployment-owned 0600 env file using the variable matrix in `JUDGE_PRODUCTION_DEPLOYMENT.md`; use generated qualification-only values. Do not put values in shell history, report, process argv, Git, or logs.

```bash
pnpm install --frozen-lockfile
pnpm qualify:production-judge-config
docker compose --env-file "$ENV_FILE" \
  -f compose.yaml -f compose.prod.yaml --profile judge config >/tmp/judge-render.yaml
```

Verify rendered output: Web only public; Judge Service loopback; API/PostgreSQL/Redis/MinIO private; required secrets have no development fallback; Judge Service non-root/read-only/cap-drop/no-new-privileges/no Docker socket/host namespaces.

## 4. Execution-cell provisioning

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin oj-sandbox  # adapt only to distro policy
id oj-sandbox
getent group docker
sudo loginctl enable-linger oj-sandbox
```

Do not add `oj-sandbox` to docker/sudo/disk/root groups. Configure its systemd user manager with delegated cpu/memory/pids. Verify a fresh process:

```bash
sudo -u oj-sandbox id -nG
sudo -u oj-sandbox sh -c 'test ! -r /var/run/docker.sock'
sudo -u oj-sandbox docker version >/dev/null 2>&1 && exit 1 || true
```

Install trusted root-owned Supervisor/Worker binaries and units. Supervisor must bind exactly `127.0.0.1:19092`.

## 5. Compiler rootfs

Build from the digest-pinned Dockerfile in a trusted build context, or install the reviewed immutable artifact:

```bash
sudo scripts/phase2c1-prepare-compiler-rootfs.sh
sudo stat -c '%U:%G %a %n' /opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1
sudo cat /opt/ojplatform/compiler-rootfs/cpp20-gcc-13-v1.identity
```

Expected current identity:

```text
ffb494c1c8ddf5cbf9357e887abb12adc37c3308016bbfeada9998c3e732c9c5
```

Do not silently accept drift. Recompute/verify full content manifest, compiler version, root ownership, no writable path, and command-template hash. Preserve the prior artifact for rollback; never use an unpinned `latest` build.

## 6. Fresh production-like start

```bash
docker compose --env-file "$ENV_FILE" \
  -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
```

Wait for Postgres/Redis/MinIO/API/Web/Judge Service health. Confirm bootstrap and both migration jobs exited 0. Inspect container users/security/mounts/networks/ports and run `ss -lntup` plus `docker ps`/`docker inspect`.

Verify:

- Product/Judge databases and migration/runtime roles are distinct.
- Runtime roles have no superuser/createdb/createrole/schema-DDL permission.
- Redis default user disabled; Product/Judge/Worker/health/admin ACL identities distinct; no unauthenticated window.
- Logs contain no qualification secret, URL userinfo, authorization header, source, or environment dump.
- Docker log rotation and native journald caps are active.

## 7. Native services and readiness

Start isolated Supervisor, then Worker (Host Agent optional). Check:

- Supervisor health/preflight passes as `oj-sandbox`.
- `ss` shows only `127.0.0.1:19092`; `0.0.0.0`/`::` is immediate FAIL.
- Worker `/ready` requires Judge Service + Worker Redis ACL + Supervisor.
- authenticated Judge Service `/v1/execution-readiness` transitions `ONLINE` -> `EXECUTION_READY` only after qualified Worker registration.
- dependency loss yields `DEGRADED`/`UNAVAILABLE` and no claim.

## 8. Tests

Run safe static/unit gates:

```bash
pnpm typecheck
pnpm test:architecture
pnpm exec vitest run \
  tests/production-judge-qualification.test.ts \
  tests/sandbox-security-qualification.test.ts \
  tests/judge-service-container.test.ts \
  tests/judge-service.test.ts \
  tests/judge-node-service.test.ts \
  tests/redis-acl-compose.test.ts \
  tests/execution-cell-docker-boundary.test.ts
(cd apps/judge-worker && go test ./... && go vet ./...)
(cd apps/sandbox-supervisor && go test ./... && go vet ./...)
```

Then run the bounded sandbox suite only with both opt-ins, as dedicated non-root identity and task-owned alternate ports/paths:

```bash
sudo -u oj-sandbox env \
  HOME=/home/oj-sandbox \
  XDG_RUNTIME_DIR=/run/user/$(id -u oj-sandbox) \
  DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u oj-sandbox)/bus \
  OJ_RUN_SANDBOX_SECURITY_QUALIFICATION=1 \
  OJ_ACK_BOUNDED_UNTRUSTED_FIXTURES=1 \
  bash tests/security/run-sandbox-security-qualification.sh
```

Required evidence: normal C++ compile/run/STL/thread/signal/temp behavior; seccomp safe denials; NOFILE and FSIZE boundaries; multi-file accounting; CPU/memory/PIDs/wall/output; network/filesystem/credential/Docker/sibling isolation; rootfs integrity; fail-closed faults; concurrency and cleanup. Python/Java are not implemented and must not be added for this qualification.

## 9. Lifecycle and recovery

Using only isolated resources:

1. Run the same Compose startup a second time; bootstrap/migrations/ACL remain idempotent.
2. Restart Judge Service; Worker reconnects and durable state remains.
3. Restart Redis; ACL is active from first reachable instant; clients reconnect.
4. Restart Worker with new incarnation; old incarnation/lease completion is rejected.
5. Restart/kill isolated Supervisor during an in-flight synthetic attempt; attempt fails closed, ownership-based cleanup runs, readiness recovers.
6. Kill/restart isolated Worker and Judge Service; verify no unsafe retry, stale result, runc state, cgroup, mount, process, or workspace.
7. Inject low-disk and low-memory preflight through bounded test thresholds; never fill disk or trigger host OOM.

A host/distro restart is optional only in this disposable host. Record `NOT_RUN` if unavailable; do not reboot a user machine.

## 10. Cleanup

Stop/remove only the unique Compose project and qualification units/resources:

```bash
docker compose --env-file "$ENV_FILE" \
  -f compose.yaml -f compose.prod.yaml --profile judge down -v --remove-orphans
```

Verify no project container/network/volume, alternate listener, task runc ID, `phase2b-*.scope`, mount, process, workspace, env file, or temporary secret remains. Preserve unrelated Docker/runtime resources.

## 11. Evidence and final verdict

Capture command, exit status, UTC time, host/kernel/runc/systemd/filesystem identity, image/rootfs digest, Compose render hash, test counts, exposure inspection, restart/recovery outcomes, and cleanup proof. Do not capture secret values.

Final `PASS` requires all acceptance rows PASS, CRITICAL/HIGH=0, no OPEN production-blocking finding, all three MEDIUM dispositions acceptable, and cleanup YES. Then and only then set:

```text
NATIVE_LINUX_FINAL_QUALIFICATION = PASS
LINUX_AMD64_FULL_JUDGE = QUALIFIED
PRODUCTION_JUDGE_QUALIFIED = YES
```

Always retain:

```text
LINUX_ARM64_FULL_JUDGE = NOT QUALIFIED
MAC_JUDGE = NOT TARGET
PHASE_5_MAC = DEFERRED
```
