# Phase 7C Windows Preview Closeout V1 Report

Date: 2026-09-20  
Status: **PASS / PREVIEW COMPLETE** (Windows fresh-host qualification deferred)

## Goal

Close Phase 7C without a clean Windows VM: keep the physical-host Windows
functional qualification, finish the two open Judge tail items (rejudge and
cancel), publish a Chinese-first GitHub landing page, integrate the Phase 7C
feature branch into `main`, and publish it, without claiming a Windows
production qualification that was never executed.

## Judge tail

### Root cause of the reported rejudge failure

The Phase 7C functional run reported `Judge Service 409` surfaced by the API as
`JUDGE_DISPATCH_UNAVAILABLE` HTTP 503. Tracing the real code showed:

1. `artifactJudgeServiceInput()` hardcoded the Judge Service idempotency key
   `clientRequestId = submission:<id>:evaluation:1` for every call, including a
   rejudge with `evaluationGeneration: 2`.
2. `POST /v1/jobs` compares the stored request digest for that
   `clientRequestId`; a generation-2 payload differs, so the Judge Service
   answered `409 CONFLICT "Conflicting clientRequestId"`. The 409 was not an
   illegal state, an optimistic-concurrency conflict or a duplicate submission
   — it was a reused idempotency identity.
3. `JudgeServiceClient.request()` collapsed every non-400/413/429 status into
   `JUDGE_DISPATCH_UNAVAILABLE` (503, retryable), so the real domain conflict
   was hidden and retried instead of reported.

### Fixes

- `artifactJudgeServiceInput(submission, artifact, requestId, generation)`
  scopes the rejudge `clientRequestId` by evaluation generation.
- `JudgeServiceClient` maps Judge Service `409` → `JUDGE_CONFLICT` (409,
  non-retryable), `404` → `JUDGE_JOB_NOT_FOUND` (404, non-retryable) and `501`
  → `JUDGE_OPERATION_UNAVAILABLE` (501, non-retryable); the dispatcher records
  `JUDGE_CONFLICT` as a precise non-retryable failure code.
- `POST /api/submissions/:id/judge/cancel` now cancels through the Judge
  Service control plane (`new apps/api/src/modules/judge/judge-service-cancellation.ts`)
  instead of the API-local Redis judge keyspace. In production the API-local
  keyspace never owns Judge Service jobs, so the previous implementation
  returned 404 for every real cancellation; the API must not reach into queue
  internals across the Judge Protocol boundary.
- The cancel publication reuses the Judge Service's own result digest, so the
  progress bridge and the read-side projection stay idempotent instead of
  producing `CONFLICTING_PUBLICATION` (observed as HTTP 500 on the submission
  detail read after a cancel).

### Live end-to-end evidence (product API + real Judge)

Harness: `scripts/phase7c-judge-tail-e2e.mjs`, executed inside the physical
Windows 11 host's WSL2 production deployment as the Web origin
(`http://127.0.0.1:8080`), using real product registration, password login,
session and CSRF cookies, problem authoring, Judge Data publication, submission,
rejudge and cancel. No session, cookie, database row or queue entry was
fabricated.

| Step | Result |
| --- | --- |
| Registration + password login | 201 / 200, `oj_session` and `oj_csrf` issued |
| Problem + Judge Data (config, upload, validate, publish) | PASS |
| Initial submission | `COMPLETED_WITH_VERDICT` verdict `AC` |
| Wrong submission | `COMPLETED_WITH_VERDICT` verdict `WA` |
| Rejudge AC submission | HTTP 200, generation 2 executed on the real Worker, verdict `AC` |
| Cancel in-flight TLE submission | HTTP 200 `CANCELLED` |
| Cancel persistence after worker completion | evaluation `CANCELLED`, verdict `null` 12 s later |
| Post-cancel submission detail read | HTTP 200, submission status `CANCELLED` |

`REJUDGE_E2E = PASS`, `CANCEL_E2E = PASS`, `NORMAL_AC_WA_REGRESSION = PASS`.
The Worker observes cancellation by polling the assignment status every 25 ms
and aborts the sandbox run, so a cancelled job stops executing; the Judge
Service rejects any late completion result, and the persisted evaluation keeps
`CANCELLED` without a verdict.

### Follow-up (not fixed, not blocking)

- A cancelled job keeps its already-started sandbox run until the worker's next
  25 ms cancellation poll; cancellation is not instantaneous for compute-heavy
  programs. `FOLLOW-UP`, not a correctness defect.
- `POST /api/submissions/:id/rejudge` is authorized by submission *read*
  access; there is no dedicated rejudge permission. Pre-existing behavior,
  unchanged in this round. `RISK / FOLLOW-UP`.

## Windows status

```text
WINDOWS_FUNCTIONAL_QUALIFICATION = PASS
  existing WSL2 reuse, install, Web, API, DB, Judge AC/WA/TLE/MLE/CE/RE,
  OnlineCodeEditor (Edge, CodeMirror, keyboard input, zero fatal JS errors),
  second-install idempotency, persistence, DEPLOY_DOCTOR, WINDOWS_DEPLOY_DOCTOR,
  rejudge, cancel
WINDOWS_FRESH_HOST_QUALIFICATION = DEFERRED
WINDOWS_REBOOT_SURVIVAL = NOT VERIFIED
```

The fresh-host (no-WSL2) bootstrap and reboot-resume qualification is deferred:
no clean Windows host without an existing WSL2 installation was available, and
no local VM can run WSL2 (the Windows 11 Home host has no Hyper-V role and the
Microsoft hypervisor/VBS path blocks nested VT-x for VMware). Host boot
configuration, VBS, HVCI, firewall and the host reboot state were not modified.

Windows is documented as **Preview / Functional Qualified**, never as
Production Qualified.

## Documentation

- `README.md` is now the Chinese default GitHub landing page (feature list,
  Linux and Windows quick starts, Windows Preview note, Chinese navigation,
  deployment status table) with `[简体中文](./README.md) | [English](./README.en.md) | [完整中文文档](./README.zh-CN.md)`.
- `README.en.md` keeps the complete English guide; `README.zh-CN.md` keeps the
  complete Chinese reference. Both carry the same status table.
- `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md` states the qualification
  state explicitly and no longer implies a qualified fresh Windows host.
- Contract tests: `tests/windows-production-install-contract.test.ts` now
  asserts Chinese-first landing content, valid language switches, Linux quick
  start, Windows preview quick start, absence of machine-specific paths, the
  deferred fresh-host marker, and that no document claims a qualified Windows
  production path.
- Relative link and anchor check across `README.md`, `README.en.md`,
  `README.zh-CN.md`, `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md` and
  `Docs/deployment/ONE_COMMAND_DEPLOYMENT.md`: 0 broken links, 0 broken anchors.

## Validation executed

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |
| `pnpm test:architecture` | PASS |
| Deployment / production-install / Windows contract tests | PASS, 55/55 |
| Judge + worker-control + artifact contract tests | PASS, 28/28 |
| Repository Vitest baseline | 15 failed files / 47 failed tests — identical to the pre-existing baseline, no new failure |
| Production Judge config qualification | `PRODUCTION_JUDGE_CONFIG_QUALIFICATION=PASS` |
| Compose core render / judge render | PASS (`CORE_RENDER_OK`, `JUDGE_RENDER_OK`) |
| OnlineCodeEditor (pinned submodule `09877bf`) | typecheck PASS, 20 files / 56 tests PASS, build PASS |
| PowerShell 5.1 parser (8 scripts) | PASS, 0 failures |
| PSScriptAnalyzer | NOT AVAILABLE (not installed) |
| `bash -n` on changed shell scripts | PASS |
| shellcheck | NOT AVAILABLE locally or in WSL; not blocking, recorded |
| `git diff --check` | PASS |

## Status

```text
PHASE_7C_WINDOWS_FUNCTIONAL = PASS
PHASE_7C_WINDOWS_FRESH_HOST = DEFERRED
PHASE_7C = PREVIEW_COMPLETE
WINDOWS_ONE_COMMAND_DEPLOYMENT = PREVIEW (not fully qualified)
LINUX_UBUNTU_DEPLOYMENT = Production Qualified (unchanged)
JUDGE_TAIL_REJUDGE = PASS
JUDGE_TAIL_CANCEL = PASS
```

## Environmental events observed during closeout validation

- At 17:50:53 local (UTC+8) the WSL2 distribution hosting the production stack
  performed a WSL-level shutdown (`systemd-logind`: "The system will power off
  now!") while a `deploy/doctor-windows.ps1` run was in flight. The next WSL
  command started the distribution again, and Docker, the six long-lived
  services, the Worker and the Supervisor recovered on their own without
  re-running any installer.
- During that restart window the Windows doctor reported one transient `FAIL`
  (API `http://localhost:8080/ready` unavailable) and `curl` from Windows
  reproduced `503` on `/ready` while `/` stayed `200`. Both doctors returned
  `PASS` again on the next run with no repair action.
- `deploy/doctor.sh` is read-only and the audit log shows only
  `./deploy/doctor.sh` was invoked, so the distribution shutdown was a WSL-level
  event and not an effect of a repository script.
- This is automatic recovery after a WSL-level distribution restart, **not**
  after a Windows host reboot. `WINDOWS_REBOOT_SURVIVAL` remains NOT VERIFIED.
