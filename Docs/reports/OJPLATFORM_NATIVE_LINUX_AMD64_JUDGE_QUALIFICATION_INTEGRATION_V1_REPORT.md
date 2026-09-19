# Native Linux AMD64 Judge Qualification Integration Report

Date: 2026-09-19

## Live Main Before

Canonical `D:\OJPlatform` was on clean `main`; `HEAD` and
`refs/heads/main` were `fa234f826b8e766ba7f29fd785243f3db5c966d7`. Existing
stashes and worktrees were recorded and preserved.

## Qualification Feature Source

Feature commit `f3700efab6c4582ed6cdf9f8bc3289d0ef494fbe` came from the
qualification bundle exported under the preserved VMware qualification VM's
external evidence directory. No VM working tree was copied over Windows main.

## Bundle Verification

SHA-256 was
`91d6d525b7f8214c64d857420d926605408870057d0b67612b60ad2f409022ad`,
matching the qualification handoff. `git bundle verify` reported complete history
and the expected feature ref.

## Feature Commit

`f3700efab6c4582ed6cdf9f8bc3289d0ef494fbe` is a direct descendant of live
main `fa234f8`. Its merge base with main was exactly `fa234f8`.

## Feature Scope Audit

All 21 changed files were reviewed. Scope was limited to rootfs reproducibility,
MinIO bootstrap, real artifact wiring, loopback Worker Redis, Redis I/O deadlines,
fail-closed readiness, stale lease/incarnation recovery, focused tests, deployment
documentation, handoff/status, and native qualification evidence. No UI, unrelated
product feature, binary, raw evidence directory, or broad formatting change was
included.

## Secret / Machine Path Audit

Added-line and tree scans found no private key, SSH material, VM credential,
qualification password, qualification-host IP/SSH endpoint, or Windows VM path
dependency. Synthetic `qualification-*` values remain only inside the production
render test. Production secrets remain required external environment values.

## Integrated Commits

- Feature: `f3700efab6c4582ed6cdf9f8bc3289d0ef494fbe`.
- Conflict-free no-ff merge: `dff7ce3`.
- Integration record: `docs: record native Linux amd64 Judge qualification integration`.

## Git Topology

The candidate branch was created from live main in a fresh worktree. The feature
commit remains the second parent lineage of the no-ff merge; no squash,
cherry-pick, rebase, force operation, or history rewrite occurred.

## Integration Method

`git merge --no-ff codex/docker-native-linux-amd64-qualification-v1` was used on
`codex/docker-native-linux-amd64-qualification-v1-integration-v1`.

## Conflicts

None. Semantic review found one cross-host rootfs identity serialization issue:
manifest sorting inherited host locale. Integration pinned `LC_ALL=C`, updated the
canonical identity, and added a regression contract. Rootfs entries and bytes did
not change.

## Rootfs Reproducibility

PASS. Base digest, Ubuntu snapshot, GCC/binutils/glibc packages, and amd64 boundary
remain pinned. Two independent WSL builds produced the same entry set and exposed
the locale-order difference. After canonical `LC_ALL=C` serialization, two native
VMware builds produced identical manifests and identity
`191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`.
The rootfs archive remained root-owned and contained no writable non-symlink path.

## MinIO Bootstrap

PASS. An isolated fresh WSL Compose project ran bootstrap once and then forced two
reruns. Bucket/user/policy provisioning stayed idempotent, logs did not expose the
synthetic access identity, and all task-owned containers, network, and volume were
removed. Native fresh-state and repeated-run evidence remains authoritative.

## Artifact Wiring

PASS. Product API artifact transport uses the required read token and loopback-only
publication. Worker verifies immutable artifact metadata and stages through the
Supervisor token. Sandbox receives neither MinIO admin nor Product DB credentials.
Focused artifact and Product/Judge bridge tests passed.

## Redis Endpoint / ACL

PASS. Production Worker Redis is loopback-only. Product, Judge Service, Worker,
health, and admin identities remain distinct; default access remains disabled.
Static ACL/Compose tests, Worker tests, production render, and native runtime ACL
evidence passed.

## Worker Timeout / Readiness

PASS. Redis dial/read/write operations are bounded. Worker stops advertising node
capacity when Redis or Supervisor is unavailable; claims remain fail-closed.
Judge execution readiness uses freshness-aware node state and transitions between
`DEGRADED` and `EXECUTION_READY` correctly.

## Lease / Incarnation Recovery

PASS. Expired leases are recovered before directed claims. Registration of a new
incarnation expires old leased assignments; stale completion remains fenced.
Focused tests passed, and native SIGKILL evidence produced one terminal TLE under
a new incarnation.

## Native Linux Evidence

Dedicated VMware Ubuntu 24.04.5 x86_64, kernel 6.8.0-139, systemd 255, cgroup v2,
runc 1.5.1, OCI 1.3.0, and libseccomp 2.5.5 evidence remains authoritative. It
covered fresh production deployment, DB/Redis/secret/network separation, real
execution, recovery, firewall, logging, cleanup, and reboot behavior. Integration
reran only the changed rootfs identity scope on that native VM.

## Real Judge Verdicts

Native real execution evidence remains: AC PASS, WA PASS, CE PASS, RE PASS, and
TLE PASS. These are native Product-to-Judge execution results, not unit-test mocks.

## Sandbox Security Regression

PASS. Native evidence retains 12 trusted probes and 14 bounded untrusted C++
fixtures across namespace, network, filesystem, credential, process, Docker,
resource, recovery, and cleanup controls. Integration changed no sandbox runtime
semantics, seccomp, rlimits, cgroups, or Supervisor code.

## Restart / Recovery

PASS. Native evidence covers second startup, all control/execution component
restarts, fail-closed dependency loss, and Worker SIGKILL recovery.

## VM Reboot Evidence

PASS x2. Existing native evidence covers clock, Docker, native units, Redis
loopback, readiness, firewall, and Docker-denial recovery after two guest reboots.

## Finding Disposition

CRITICAL open: 0. HIGH open: 0. MEDIUM open: 0. Seccomp and aggregate workspace
limits remain `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL`; `RLIMIT_NOFILE`
remains RESOLVED and per-file `RLIMIT_FSIZE` remains enforced.

## Main Baseline Regression

The clean-main baseline had 16 failing files / 48 failed tests / 942 passed tests.
The final serial candidate run had the identical 16-file and 48-test failure set,
944 passed tests, and two added passing qualification/recovery tests. New failing
files: 0. No unrelated baseline debt was changed.

## Handoff Update

Handoff is 96 lines. Phase 6A and Phase 6B-1 through 6B-6 are PASS / MERGED.
Linux amd64 and Production Judge are QUALIFIED. ARM64 and Mac boundaries and
accepted residual controls remain explicit. No native-pending hot state remains.

## PROJECT_STATUS Record

An append-only integration record follows the historical PARTIAL and feature PASS
records. Historical statements were not rewritten.

## Validation

Passed: bundle checksum/verification; full scope and secret/path audits;
`git diff --check`; targeted Prettier/ESLint; TypeScript typecheck/build;
architecture gate; 163 pre-normalization focused tests and 47 final affected
tests; all Worker and Supervisor Go tests/vet; Go changed-file gofmt; production
Compose render/fail-closed secret gate; fresh and repeated MinIO bootstrap; native
two-build rootfs reproduction; full-suite baseline comparison. Native sandbox and
real-verdict evidence was preserved rather than misrepresented as Windows/WSL.

## Main After

After final validation, canonical main is advanced only by `git merge --ff-only`
to the validated integration candidate. Final live hash and cleanliness are
reported by the integration command output.

## Qualification VM Preservation

The qualification VM, base VM, `clean-base` snapshot, bundle, and external
evidence remain preserved. The qualification VM was powered on only for the
rootfs recheck, left without temporary sudo/resources, then powered off again.

```text
NATIVE_LINUX_AMD64_QUALIFICATION_INTEGRATION = PASS
QUALIFICATION_FEATURE_COMMIT = f3700efab6c4582ed6cdf9f8bc3289d0ef494fbe
QUALIFICATION_BUNDLE_VERIFIED = YES
ROOTFS_REPRODUCIBILITY = PASS
MINIO_BOOTSTRAP = PASS
ARTIFACT_WIRING = PASS
REDIS_ACL_REGRESSION = PASS
WORKER_READINESS = PASS
LEASE_INCARCATION_RECOVERY = PASS
REAL_JUDGE_AC = PASS
REAL_JUDGE_WA = PASS
REAL_JUDGE_CE = PASS
REAL_JUDGE_RE = PASS
REAL_JUDGE_TLE = PASS
SANDBOX_SECURITY_REGRESSION = PASS
NATIVE_LINUX_FINAL_QUALIFICATION = PASS
LINUX_AMD64_FULL_JUDGE = QUALIFIED
PRODUCTION_JUDGE_QUALIFIED = YES
OPEN_CRITICAL_FINDINGS = 0
OPEN_HIGH_FINDINGS = 0
OPEN_MEDIUM_FINDINGS = 0
LINUX_ARM64_FULL_JUDGE = NOT QUALIFIED
MAC_JUDGE = NOT TARGET
PHASE_5_MAC = DEFERRED
CURRENT_HANDOFF_LINES = 96
CURRENT_HANDOFF <= 120 = YES
```
