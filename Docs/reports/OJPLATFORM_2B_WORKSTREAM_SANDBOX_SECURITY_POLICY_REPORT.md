# OJPlatform Phase 2B Sandbox Security Policy Report

## 1. Status

**PASS for Security/Auth policy scope; Runtime qualification remains pending.**

The control-plane policy implements only `SANDBOX_PROBE_QUALIFICATION`. It does not implement OCI/runc, namespaces, cgroups, seccomp, cleanup, Web, or submitted-source execution.

## 2. Worktree / Provenance

- Worktree: `D:\OJPlatform-worktrees\phase1b-authz`
- Branch: `codex/phase2b-sandbox-security-policy`
- Baseline: `ebf2e06`
- Starting HEAD: `ebf2e063054085918db089a879e53775d9caefcd`
- Baseline is an ancestor of the starting and final HEAD.
- Starting tracked worktree was clean.

## 3. Files / Commits

Files changed by this Worker:

- `apps/api/src/modules/authz/sandbox.ts`
- `apps/api/src/modules/authz/index.ts`
- `tests/sandbox-authz.test.ts`
- this report

Implementation commit: `5b04f97 feat: implement phase 2B sandbox security policy`. Report metadata commit: `2c50e26 docs: record phase 2B sandbox authz evidence`. No merge or history rewrite was performed.

## 4. Existing Authz Reuse

| Concern | Existing mechanism | Reuse / extension | New risk |
|---|---|---|---|
| authentication/session | Phase 2A `WorkerAuthContext` active/password/session checks | reused by Sandbox policy | none identified |
| roles/capabilities | exact role-to-capability maps and server role resolver | extended with typed Sandbox actions | client roles ignored when resolver exists |
| resource authority | resolver pattern from Worker Authz | `resolveSandbox` and `resolveTrustedProbe` | missing resolver fails closed |
| audit | additive hook abstraction | field-by-field Sandbox event | sensitive fields excluded |
| anti-enumeration | stable safe denial classes | `NOT_FOUND_OR_NOT_VISIBLE` and bounded codes | no hidden resource detail |

## 5. Operation Model / Decision Contract

Typed operations are exactly: `INSPECT_SANDBOX_STATUS`, `INSPECT_SANDBOX_QUALIFICATION`, `INSPECT_SANDBOX_CAPABILITIES`, `START_TRUSTED_PROBE`, `CANCEL_TRUSTED_PROBE`, and `VERIFY_SANDBOX_CLEANUP`.

Each decision returns `{ allowed, operation, code, reason }`. Unknown operation, malformed actor, missing resource, unknown policy/state/probe, capability mismatch, terminal mutation, and degraded backend deny without runtime side effects. Generic command, executable, mount, network, environment, seccomp, privilege, process-kill, and real-execution operations have no API.

## 6. Visibility Classification

| Data | Ordinary user | Authorized operator | Internal-only / sensitive |
|---|---|---|---|
| generic qualification availability | policy denial unless separately exposed | safe diagnostic | - |
| backend type/status | no | safe summary | raw backend internals |
| qualification/policy/probe-suite status | no | safe metadata | raw policy/profile |
| isolation capability status | no | high-level PASS/PARTIAL/FAIL/PENDING | namespace/seccomp details |
| cleanup/degraded/failure category | no | safe category/status | raw paths/logs |
| host/OCI/rootfs/cgroup paths | never | never | internal only |
| namespace IDs, runc state, command line, probe executable | never | never | internal only |
| credentials, environment, source, lease/control tokens | never | never | sensitive |

## 7. Trusted Probe Control

Start requires active authenticated actor, exact server-resolved `sandbox:probe:start`, authoritative resource, known registry `probeId`, known policy, compatible state, non-degraded backend, and no `FAIL` qualification state. Probe version/hash/artifact are server registry fields; clients cannot supply executable paths, bytes, scripts, hash overrides, policy overrides, mounts, environment, network, or privilege.

## 8. Cancellation / Mutation

Cancel targets only an authoritative Sandbox resource in `PROBE_ACTIVE`, requires exact cancel capability and known trusted probe, and never targets a host PID/process/container. `READY`, `CLOSED`, cleanup states, stale IDs, repeated cancellation, unknown states, and terminal resources deny safely. Cleanup verification is allowed only for pending/failed cleanup states and remains a request, not execution.

## 9. Capability / Policy Honesty

Projection reports backend `DEDICATED_SUPERVISOR_OCI_RUNC`, mode `SANDBOX_PROBE_QUALIFICATION`, `realSubmissionExecution: false`, authoritative qualification status, backend status, policy version, and probe suite version. `QUALIFICATION_PENDING`, `PARTIAL`, `FAIL`, `DEGRADED`, and cleanup failure remain visible; configured/implemented is never collapsed into qualified. Unknown policy is unsupported/denied.

## 10. Audit Model

Privileged allow and deny decisions produce minimized events containing only actor ID, operation, safe resource/probe IDs, safe policy version, outcome, bounded reason code, correlation ID, and timestamp. Source, probe bytes, session/lease tokens, Redis/Postgres/MinIO secrets, host paths, OCI/cgroup data, and arbitrary metadata are never copied.

## 11. Safe Errors / Anti-enumeration

Stable codes implemented: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND_OR_NOT_VISIBLE`, `INVALID_OPERATION`, `INVALID_STATE`, `POLICY_MISMATCH`, `UNSUPPORTED_CAPABILITY`, `UNKNOWN_PROBE`, and `CONFLICT`. Ordinary users cannot distinguish hidden resource existence through diagnostics; operator detail is available only after exact capability and authoritative resolution.

## 12. N2B-01..N2B-30

All 30 independently named tests PASS in `tests/sandbox-authz.test.ts`.

| ID | Setup | Expected | Actual / evidence | Result |
|---|---|---|---|---|
| N2B-01 | unauthenticated inspect | deny | false | PASS |
| N2B-02 | ordinary diagnostics | deny | false | PASS |
| N2B-03 | inactive operator | deny | false | PASS |
| N2B-04 | unknown operation | deny | false | PASS |
| N2B-05 | malformed operation | deny | false | PASS |
| N2B-06 | unknown state mutation | deny | false | PASS |
| N2B-07 | unknown policy | deny | false | PASS |
| N2B-08 | unknown probe | deny | false | PASS |
| N2B-09 | forged hash | deny/ignore | policy mismatch | PASS |
| N2B-10 | executable path operation | deny | false | PASS |
| N2B-11 | shell operation | deny | false | PASS |
| N2B-12 | host mount operation | deny | false | PASS |
| N2B-13 | network target operation | deny | false | PASS |
| N2B-14 | env injection operation | deny | false | PASS |
| N2B-15 | seccomp override | deny | false | PASS |
| N2B-16 | root/device privilege | deny | false | PASS |
| N2B-17 | stale resource | deny | false | PASS |
| N2B-18 | completed probe cancel | deny/no-op | false | PASS |
| N2B-19 | repeated cancel | deny/no-op | false | PASS |
| N2B-20 | inspect-only capability | no control | false | PASS |
| N2B-21 | qualification vs real execution | real mode absent | safe mode only | PASS |
| N2B-22 | source marker | absent | absent from audit | PASS |
| N2B-23 | secret markers | absent | absent from audit | PASS |
| N2B-24 | host path marker | absent | absent from projection | PASS |
| N2B-25 | arbitrary metadata | not copied | absent from audit | PASS |
| N2B-26 | malformed actor | deny | false | PASS |
| N2B-27 | inactive session | deny | false | PASS |
| N2B-28 | policy downgrade | deny | policy mismatch | PASS |
| N2B-29 | real-submission operation | deny | false | PASS |
| N2B-30 | generic process kill | deny/absent | false | PASS |

## 13. A2B-01..A2B-30

All 30 independently named tests PASS. They cover authorized inspection, safe status/policy/capability visibility, pending/failed/degraded honesty, trusted probe start/cancel/cleanup, state and registry authority, session re-evaluation, capability separation, safe errors, audit creation/minimization, exact linkage, and narrow Lead interface.

## 14. Marker Leakage Results

Synthetic `SOURCE_MARKER_PHASE2B`, `SESSION_SECRET_MARKER_PHASE2B`, `REDIS_SECRET_MARKER_PHASE2B`, `DB_SECRET_MARKER_PHASE2B`, `OBJECT_SECRET_MARKER_PHASE2B`, `HOST_PATH_MARKER_PHASE2B`, `LEASE_TOKEN_MARKER_PHASE2B`, and arbitrary metadata markers are absent from ordinary/operator projections, audit events, and serialized decisions.

## 15. Tests / Evidence

- `pnpm exec vitest run tests/sandbox-authz.test.ts tests/worker-authz.test.ts`: 2 files, 102 passed.
- `pnpm test`: 17 files passed, 1 skipped; 259 passed, 3 skipped.
- `pnpm format:check`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test:architecture`: PASS.
- `pnpm build`: PASS.
- `git diff --check`: PASS.

## 16. Integration Requests

**IR-2B-AUTH-01:** Lead must wire the typed policy into central API composition and supply authoritative actor roles, Sandbox resource state, trusted probe registry, policy version, and audit sink. Runtime must call only the narrow probe-control interface. Re-run A2B/N2B suites plus the Phase 2B contract and runtime matrix after wiring. No generic execution interface is requested.

## 17. Limitations / Dependency Requests

No new dependency requests. Runtime isolation, OCI/runc, filesystem/network/PID/mount/cgroup/seccomp enforcement, trusted probe execution, cleanup security, real environment qualification, Web UX, and `PROJECT_STATUS` remain Runtime/Web/Lead-owned and are **NOT VERIFIED** here. This report does not claim Sandbox security qualification or real submission execution.

## 18. Git State / Readiness

Final HEAD: `2c50e26`. Tracked worktree is clean after the scoped commits.

READY FOR LEAD INTEGRATION = YES
