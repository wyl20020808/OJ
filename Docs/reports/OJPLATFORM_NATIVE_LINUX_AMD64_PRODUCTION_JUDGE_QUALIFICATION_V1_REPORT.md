# OJPlatform Native Linux amd64 Production Judge Qualification V1 Report

Date: 2026-09-19

## Verdict

```text
NATIVE_LINUX_FINAL_QUALIFICATION = PASS
LINUX_AMD64_FULL_JUDGE = QUALIFIED
PRODUCTION_JUDGE_QUALIFIED = YES
LINUX_ARM64_FULL_JUDGE = NOT QUALIFIED
MAC_JUDGE = NOT TARGET
PHASE_5_MAC = DEFERRED
```

This verdict applies to the reviewed feature branch based on main commit
`fa234f826b8e766ba7f29fd785243f3db5c966d7`. Integration into `main` remains a
separate controlled action.

## Scope and isolation

- Dedicated full VMware clone; base VM and `clean-base` snapshot were preserved.
- Ubuntu Server 24.04.5 LTS, Linux 6.8.0-139-generic, native VMware x86_64.
- ext4, cgroup v2, systemd 255, runc 1.5.1, OCI 1.3.0, libseccomp 2.5.5.
- Docker 29.8.1 and Compose 5.5.1.
- Fresh Git clones and qualification-only users, ports, databases, volumes,
  secrets, units, submissions, and IDs.
- No Windows `main`, WSL/Docker Desktop runtime, real user data, or production
  secret participated.

## Implemented qualification fixes

1. Made the compiler rootfs reproducible from a dated Ubuntu snapshot, including
   pinned CA bootstrap and `linux-libc-dev`; deterministic identity is
   `cfb8d628eb7ef2ceb0257e27a1f82f2deb4eb312cfd3ca2498b302564a5a7e14`.
2. Added the narrow Ubuntu AppArmor `/usr/bin/runc` `userns` grant required by
   Ubuntu 24.04. Global unprivileged-userns or other security controls were not
   disabled.
3. Replaced unavailable Docker Hub MinIO tags with pinned Quay images and added
   hardened, idempotent bucket/user/policy bootstrap. Bootstrap output no longer
   logs the S3 access identity.
4. Wired real Product-to-Judge artifact execution: required artifact token,
   loopback Product artifact API, and production `REAL_SUBMISSION_EXECUTION`.
5. Added stable loopback-only Worker Redis publication. This replaced the
   reboot-unsafe container-IP configuration while preserving no public Redis
   ingress and distinct ACL credentials.
6. Added bounded Redis dial/read/write deadlines in the Go Worker. A stopped or
   blackholed Redis now changes Worker readiness to 503 instead of hanging with
   stale readiness.
7. Recovered expired queue leases before node-directed claims and expired old
   node assignments on incarnation replacement. An in-flight Worker SIGKILL now
   retries under a new incarnation and reaches one terminal result.
8. Stopped Worker node heartbeats while local Redis/Supervisor dependencies are
   unavailable and made Judge execution readiness use freshness-aware node
   state. Supervisor loss now transitions Worker to 503 and Judge readiness to
   `DEGRADED`.
9. Declared the Host Agent's direct Fastify runtime dependency so a production
   deployment closure can be built.

## Runtime evidence

### Deployment and boundaries

- Default Core and `judge` profile startup passed.
- Product and Judge migrations/bootstrap exited 0.
- MinIO bootstrap passed on fresh state and two forced idempotent reruns.
- API, Web, PostgreSQL, Redis, MinIO, and Judge Service were healthy.
- Web was the only public HTTP ingress (`0.0.0.0:18080`).
- Product artifact API, Worker Redis, Judge Service, Supervisor, Worker health,
  and Host Agent were loopback-only.
- PostgreSQL and MinIO had no host publication.
- External VMware-network probes reached Web and could not reach ports 13000,
  13100, 16379, 5432, 6379, 9000, 9001, 19092, 19093, or 13180.
- UFW was active with default incoming deny; only OpenSSH and TCP 18080 allowed.

### Identity, database, and secret separation

- `oj-sandbox` ran as 999:987 with no sudo or Docker group and no Docker daemon
  access before and after reboot.
- Supervisor, Worker, and Host Agent used separate service users and protected
  environment files.
- Product and Judge runtime PostgreSQL roles were distinct, non-superuser,
  non-createdb, non-createrole, and lacked schema CREATE permission.
- Product/Judge/Worker/health/admin Redis ACL identities were distinct; default
  Redis access was disabled. ACL qualification passed after restart and reboot.
- Missing required production secrets failed Compose rendering closed.
- Sensitive-value scan covered 20 password/token/key/URL values across Docker
  and native journals and passed.
- Docker logs used 10 MiB x 5 rotation; journald used bounded 200 MiB persistent
  and 100 MiB runtime limits.

### Sandbox and limits

The final bounded native suite passed with 12 trusted probes and 14 untrusted
repository-owned C++ fixtures:

- rootless runc and dedicated non-root Supervisor;
- read-only immutable compiler rootfs;
- network, filesystem, process, credential, and Docker isolation;
- namespace, capability, `no_new_privs`, cgroup v2, PID, CPU, memory, wall,
  output, NOFILE, FSIZE, and aggregate workspace controls;
- concurrency, malformed/crash behavior, fault injection, recovery, and cleanup;
- no stale workspace, mount, runc process, cgroup scope, or listener.

Seccomp remains the formally accepted amd64 denylist with documented
compensating controls. Aggregate compile quota remains the formally accepted
bounded monitor with fail-closed accounting and free-space admission reserve.

### Real Judge workflows

Real browser/API contract traffic traversed Product API -> immutable JudgeData
artifact -> Judge Service -> Worker -> Supervisor -> rootless runc -> durable
Judge result -> Product evaluation. Observed terminal verdicts:

| Workflow | Verdict |
| --- | --- |
| valid C++20 sum | AC |
| wrong output | WA |
| compiler error | CE |
| runtime fault | RE |
| infinite loop | TLE |

All used one immutable published testcase set and durable Product/Judge records.
Focused tests also passed cancellation, idempotency, duplicate-delivery,
stale-token, retry, artifact-integrity, and terminal-publication contracts.

### Recovery

- Same Compose startup passed twice.
- Redis, PostgreSQL, MinIO, API, Web, Judge Service, Supervisor, Worker, and Host
  Agent restart recovery passed.
- Redis loss: Judge and Worker failed closed; ACL and clients recovered.
- Judge loss and Supervisor loss: Worker readiness became 503 and claims stopped.
- Supervisor loss aged the node out; Judge execution readiness became
  `DEGRADED`; recovery restored `EXECUTION_READY`.
- Worker was SIGKILLed during a real 10-second-limit attempt. A new random
  incarnation expired the old assignment, recovered the lease, and produced a
  single TLE terminal result.
- Two guest reboots passed. Clock synchronization, Docker services, native
  units, Redis loopback endpoint, Supervisor user unit, Worker readiness,
  firewall, and Docker denial recovered automatically.

## Validation summary

Passed:

- changed-file formatting and `git diff --check`;
- TypeScript typecheck, architecture gate, and build;
- affected Vitest suites: 40/40, then readiness suites 19/19;
- Go Worker and Supervisor `go test ./...`, `go vet ./...`, and gofmt;
- production Compose configuration qualification;
- full native Phase 6B-5 sandbox qualification;
- real runtime workflows and lifecycle evidence above.

The repository-wide format, lint, and Vitest commands remain red for unrelated
pre-existing main-branch debt. A detached clean baseline at `fa234f8` reproduced
exactly the same results: formatting 29 files, lint 8 errors, and Vitest 26 failed
files / 5 failed tests. The feature branch had the same failing-file set and
added one passing test (571 passed versus baseline 570); no new full-suite
failure was introduced.

## Finding disposition

```text
CRITICAL open = 0
HIGH open = 0
MEDIUM open = 0
```

Accepted residual risks are unchanged: amd64 default-allow seccomp denylist,
bounded userspace aggregate compile accounting, and kernel/runc zero-day risk.
They are documented controls, not open findings.

## Final matrix

| Area | Status |
| --- | --- |
| HOST | PASS |
| COMPOSE | PASS |
| MIGRATIONS | PASS |
| SECRETS | PASS |
| NETWORK | PASS |
| DATABASE ISOLATION | PASS |
| REDIS ACL | PASS |
| SANDBOX PRIVILEGE | PASS |
| SECCOMP | PARTIAL - accepted compensating controls |
| NOFILE | PASS |
| FILE SIZE / WORKSPACE | PARTIAL - accepted compensating controls |
| CPU | PASS |
| MEMORY | PASS |
| PIDS | PASS |
| WALL | PASS |
| OUTPUT | PASS |
| EXECUTION READINESS MODEL | PASS |
| RECOVERY | PASS |
| REBOOT | PASS |
| LOGGING / ROTATION | PASS |
| CLEANUP | PASS |
| LINUX AMD64 FULL JUDGE | QUALIFIED |
| LINUX ARM64 FULL JUDGE | NOT QUALIFIED |
| MAC JUDGE | NOT TARGET |
| PHASE 5 MAC | DEFERRED |
