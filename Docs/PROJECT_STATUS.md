# OJPlatform Project Status

## Root Submission Source Access V1

PASS on branch `codex/root-submission-source-access-v1`. Submission detail
authorization now uses the canonical `submission:view:any` permission resolver
for highest-admin cross-owner source access, while owner-only and anonymous /
ordinary-user denial remain enforced. Global evaluation list and SSE paths do
not expose source. Focused authorization tests, typecheck, build, and diff check
pass; browser runtime was not run.

JudgeData Artifact Pipeline V1: PASS / INTEGRATED. Streaming upload, immutable
artifacts, reference dispatch, bounded Worker fetch, Supervisor opaque-handle
transport, and dispatch recovery are implemented. Real authenticated 100 MiB
runtime qualification reached terminal AC. ADR 0006 is ACCEPTED. See
`reports/OJPLATFORM_JUDGEDATA_ARTIFACT_PIPELINE_V1_REPORT.md`.

V3 UI Final Integration V1: PASS. Problem Page UX V3, Evaluation Detail UX V3,
and Admin Chinese + Notification V1 are integrated with their required
traditional submission, normal-flow Problem information card, live Evaluation
state monotonicity, Admin Chinese presentation, and notification dismissal
behavior preserved. Focused tests pass 20/20, 10/10, and 172/172; Web typecheck,
build, targeted ESLint, and diff checks pass. Runtime/browser/real-SSE
qualification was explicitly excluded and remains not verified. See
`reports/OJPLATFORM_V3_UI_FINAL_INTEGRATION_V1_REPORT.md`.

Problem Page UX Remediation V3: PASS. The Problem title action again opens the
existing traditional submission route with its language selector, source field,
and formal Submission API integration. Problem metadata is product-facing, the
right information card remains in document flow, and sample input/output are
separate light panels whose copy action preserves only the input text. Focused
Web tests, Web typecheck, Web build, and diff checks pass. Runtime/browser E2E
was explicitly excluded. See
`reports/OJPLATFORM_PROBLEM_PAGE_UX_V3_REPORT.md`.
Evaluation Detail UX + Live State Prep V3: PARTIAL. The desktop right-side information card, mobile natural stacking, preserved top testcase grid, post-snapshot SSE subscription, ordinal-aware monotonic live merge, and focused WAITING/RUNNING/AC/WA/infra fixtures are implemented and pass static gates. A frontend bug could prevent EventSource creation after the asynchronous initial snapshot and is fixed. Real SSE/browser runtime qualification was explicitly prohibited and remains not run. See `Docs/reports/OJPLATFORM_EVALUATION_DETAIL_UX_V3_REPORT.md`.
Admin Chinese UX + Notification Popover V1: PASS. The Admin Judge page now uses
Chinese presentation for headings, metrics, state display, actions, supporting
copy, and empty/loading/error states while preserving technical identifiers and
backend enum values. Notification outside-click, Escape, toggle, close button,
inside-click preservation, and listener cleanup are focused-tested. See
`Docs/reports/OJPLATFORM_ADMIN_CN_NOTIFICATION_V1_REPORT.md`.

Product/Judge/UI Remediation Runtime Resume V1: PARTIAL. Canonical main
`511830d` merged into remediation at `4b0ea17`. A minimal Runtime Manager
listener lookup fallback fixed a machine-specific `Get-NetTCPConnection` blind
spot; official stop released application ports while preserving infrastructure.
Clean start remains blocked by a persisted Worker that restarted Host Agent
fail-closes as unreconciled; another Worker has unknown ownership and was not
touched. Issue 1, Issue 4, and Issue 8 runtime/browser qualification is not
claimed. See
`reports/OJPLATFORM_PRODUCT_JUDGE_UI_REMEDIATION_RUNTIME_RESUME_V1_REPORT.md`.

Product + Judge + UI Remediation V1: PARTIAL. Judge Data immutable-version
draft cloning, evaluation/list testcase presentation, China-mainland login
classification, and Product Judge Admin runtime-config consumption are
implemented and focused-tested. Worker/Supervisor execution-set rejections now
retain bounded contract diagnostics. Managed runtime qualification is blocked:
official start reaches Judge Service `EADDRINUSE`, while official drain is
rejected for an old Worker with active work. Issue 1 root cause and all required
browser/SSE/runtime assertions remain unverified. See
`OJPLATFORM_PRODUCT_JUDGE_UI_REMEDIATION_V1_REPORT.md`.

- Runtime Legacy Reconciliation Main Merge V1: PARTIAL. Runtime legacy ownership reconciliation is merged into canonical `main` at `214fb0c`; PowerShell 5.1/7 parsing, focused ownership tests, and root BAT wiring pass. Root Stop/Start/Restart smoke remains blocked by an active Judge job and was not interrupted; final status found existing Web-down and stale-Worker state owned by a separate worktree. See `Docs/reports/OJPLATFORM_RUNTIME_LEGACY_RECONCILIATION_MAIN_MERGE_V1_REPORT.md`.

- Runtime Legacy Orphan Reconciliation + True Stop V1: PASS. The Runtime Manager now resolves proven OJPlatform listeners missing from shared state through validated legacy records or registered worktree command identity, reports legacy ownership explicitly, stops only proven PIDs, and fails closed for external listeners or unreleased application ports. Focused PowerShell 5.1/7 tests, real legacy/external listener scenarios, normal stop with infrastructure preservation, and idempotent start pass. See `Docs/reports/OJPLATFORM_RUNTIME_LEGACY_RECONCILIATION_V1_REPORT.md`.

- Goal B JudgeData 100 MiB Streaming V1: implementation complete; focused Product/ZIP and Worker validation pass. Supervisor runtime qualification blocked by existing Linux-only/runtime environment failures. See `Docs/reports/OJPLATFORM_JUDGEDATA_100MB_STREAMING_V1_REPORT.md`.

Project: OJPlatform
Architecture Baseline: [V1](OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
Current Stage: UNIFIED JUDGE RUNTIME INTEGRATION V1 PASS
Current Status: PRODUCT/JUDGE DEFECT REMEDIATION COMPLETE; TOKEN_WHITESPACE IS THE NEW-DATA DEFAULT WITH EXPLICIT EXACT_BYTES ADVANCED SETTING

Final Feature Integration + Real E2E Qualification V1: PARTIAL. Final branch `codex/final-feature-integration-v1` is assembled at `54c208c` from `60e4fa2` with full D.1 ancestry and runtime reconciliation. Focused tests/builds, runtime startup, browser ad-hoc Run Code, formal submission intake, authenticated SSE delivery, Redis-backed projection wiring, and real `TESTCASE_STARTED` observation pass. Qualification remains blocked by runtime `REAL_EXECUTION_SET_INFRA_FAILURE` before `TESTCASE_TERMINAL`; no PASS or unified baseline is claimed. See `reports/OJPLATFORM_FINAL_FEATURE_INTEGRATION_E2E_QUALIFICATION_V1_REPORT.md`.

Runtime Control Final Integration V1: PASS. Cross-worktree Runtime Control was merged into `codex/final-feature-integration-v1` with a shared `ojplatform-local` registry, authoritative resource probes, safe cross-worktree stop/start behavior, and fail-closed external listener handling. Focused status, normal stop, detached-peer status/stop, restart, stop -All, volume preservation, and start-after-stop-All checks pass. Existing Product/Judge E2E qualification remains PARTIAL because this integration did not process `REAL_EXECUTION_SET_INFRA_FAILURE`. See `reports/OJPLATFORM_RUNTIME_CONTROL_FINAL_INTEGRATION_V1_REPORT.md`.

Goal D Evaluation Detail + SSE Live Progress V1: PARTIAL. Evaluation Detail tabs, authoritative queued/running snapshots, authenticated bounded SSE, cursor replay, duplicate-safe browser merge, and focused tests are implemented on `d646a2b`. Real Judge testcase event emission and runtime SSE qualification remain blocked by JudgeData/runtime availability. See `reports/OJPLATFORM_EVALUATION_DETAIL_SSE_LIVE_PROGRESS_V1_REPORT.md`.

Goal D.1 Judge Incremental Events + Redis SSE Qualification V1: PARTIAL. Judge-side queued/started/testcase-started/testcase-terminal/evaluation-terminal events, safe hidden-data filtering, Product durable projection bridge, and bounded Redis Pub/Sub fanout are implemented and focused-tested. Real formal SSE/browser qualification remains `BLOCKED_BY_JUDGE_DATA` because the active runtime is owned by a different source worktree. See `reports/OJPLATFORM_EVALUATION_DETAIL_SSE_D1_REAL_PROGRESS_V1_REPORT.md`.

Auth real-runtime remediation: PASS for password verifier/diagnostics and
durable Guest identity/session recovery. The active Product runtime database
does not contain the reported root email, so `ROOT PASSWORD CREDENTIAL STATUS`
is `UNKNOWN`; no root credential was changed. Canonical local Web origin is
`http://127.0.0.1:5173` and no localhost/127.0.0.1 cookie split was found.

Default Checker V1: PASS. New Judge Data drafts default to `TOKEN_WHITESPACE`
in Product and Web fallbacks, while explicit `EXACT_BYTES` remains available
in the advanced Judge settings. Existing drafts and published immutable
versions retain their stored checker. See
`OJPLATFORM_DEFAULT_CHECKER_TOKEN_WHITESPACE_V1_REPORT.md`.

Product Judge Runtime Defect Remediation V1: PASS. The local Product path now
rejects non-executable Judge Data before publication, verifies fetched object
integrity during validation, maps historic manifest-contract failures to a safe
409 rather than 500, and preserves safe Product error messages in the
submission route. Browser evidence on the current unified source covers fresh
private authoring, Judge Data upload/Validate/Publish, AC/WA/CE/RE and
per-testcase detail, oversized-data validation failure, unpublished submission
failure, and duplicate-slug UI handling. The established `EXACT_BYTES` A+B
trailing-newline behavior was proved and deliberately not changed. See
`OJPLATFORM_PRODUCT_JUDGE_RUNTIME_DEFECT_REMEDIATION_V1_REPORT.md`.

Unified Judge Runtime Integration V1: PASS. Product/Web `4df8c2c` and
Phase 2C.8D `4462fbd` are formally preserved by merge `d4e04ca`, with Product
and Judge migrations independently passing and TypeScript/Web/Go gates passing
in their applicable host environments. The current-source Supervisor -> Judge
Service -> Host Agent -> Worker ONLINE -> Sandbox chain is runtime verified,
including direct Judge AC/WA/CE/RE/TLE/MLE and lifecycle evidence. Authorized
local Browser/Product Guest A+B authoring, real Judge Data v1 publication,
Product AC/WA, and Submission Detail per-testcase evidence are also complete:
AC `24affb4f-92af-424b-9dc2-161610938c07` and WA
`598a0092-858d-4af8-ad3c-890bae9ed11e` ran through the Host-Agent-owned
Worker. See
`OJPLATFORM_UNIFIED_JUDGE_RUNTIME_INTEGRATION_V1_REPORT.md`.

Web UI Polish and Evaluation List V1: PARTIAL. Problem Detail actions are
consolidated below the title with owner/Guest-owner edit entry; duplicate Web
"我的题目" surfaces are retired and the existing create flow is available from
the problem library. "提交记录" is now "评测列表" and uses the actual
owner-scoped Product submission contract without source expansion. The Product
Backend does not provide a global evaluation-list capability, safe submitter
projection, or descending-time ordering, so no global data was fabricated.
Statement-editor refresh/problem-publication controls were removed while Judge
Data validation/publication remains. See
`OJPLATFORM_WEB_UI_POLISH_EVALUATION_LIST_V1_REPORT.md`.

Phase 3D.1 Submission Detail + Per-Testcase Results V1: PASS for the qualified local scope. Terminal Judge facts are reduced to a safe durable per-generation Product projection; no Product verdict engine was added. The selected-generation API, immutable historical detail, bounded scrubbed CE diagnostics, responsive detail UI, and strict stale/duplicate/backfill protections are implemented and tested. Existing real Phase 3D AC/WA/CE/RE/TLE/MLE records and Generation 1 -> 2 were projected and persisted locally; owner browser details were checked at desktop/tablet/mobile without overflow or console errors. Generation-selector browser behavior is covered by focused Web tests; this session could not authenticate as the historical Generation 1 -> 2 owner. No production or unsupported Judge/Product features are claimed; see `OJPLATFORM_PHASE_3D1_SUBMISSION_DETAIL_PER_TESTCASE_RESULTS_V1_REPORT.md`.

Phase 3D Real Submission + Judge Dispatch Product Flow V1: PASS for the qualified local scope. Product Submissions bind one exact published JudgeDataVersion and manifest hash, Product reads and hash-verifies private testcase objects before creating the existing 2C.4 manifest for dispatch, C++20 is the only submission profile, and Guest owner binding/rate limiting plus Product-only status presentation are implemented. Fresh Guest Browser -> Product -> standalone Judge Service -> Worker -> Supervisor -> Sandbox -> Product projection paths are RUNTIME VERIFIED for AC, WA, CE, RE, TLE, and MLE. Product API rejudge is RUNTIME VERIFIED from generation 1 to 2; inherited 2C.6 real PostgreSQL evidence covers cancellation without a verdict, stale publication rejection, and duplicate-rejudge serialization. Responsive submission presentation is verified at desktop/tablet/mobile viewports. No unsupported browser lifecycle mutation or production qualification is claimed; see `OJPLATFORM_PHASE_3D_REAL_SUBMISSION_JUDGE_DISPATCH_PRODUCT_FLOW_V1_REPORT.md`.

Phase 3C Problem Judge Data Lead Integration + Guest Authoring V1: PASS / 3A Backend and 3B Web histories integrated on 2C.8BC; Guest server-side create/edit-own/Judge Data authorization, CSRF, rate limits, Product upload-contract reconciliation, complete gates, and real PostgreSQL/MinIO Product/browser G1/G2 E2E qualified. v1/v2 history, per-testcase overrides, responsive editor, and G2/Judge Admin denials are evidenced in `OJPLATFORM_PHASE_3C_PROBLEM_JUDGE_DATA_LEAD_INTEGRATION_GUEST_AUTHORING_V1_REPORT.md`.

Parallel Worker Model: STABILIZED / PERMANENT SLOT MODEL ENABLED
Product Lead Integration V1: PASS / qualified Backend + Web integrated; Judge remains separate; final closure `eb7912e`
Phase 2C.8BC Product Judge Admin Integration Reconciliation V1: PASS / Product + real frozen Judge read boundary qualified; final report `OJPLATFORM_2C8BC_PRODUCT_JUDGE_ADMIN_INTEGRATION_RECONCILIATION_V1_REPORT.md`
Phase 2C.8D Local Judge Host Agent + Elastic Pool V1: PASS / Host Agent lifecycle hardening (including template-aware owned-resource capacity ceiling and fail-closed restart ownership), durable Judge pool policy/audit state, Product RBAC, Judge Service autoscaler loop and Web controls implemented. Full gates, Safe Fixture A/B routing, autoscaling, capacity blocking, idle scale-down, configured Product browser Add/Restart/Stop controls across desktop/tablet/mobile, and fresh real C++20 Supervisor/Worker scheduler routing across Host Agent Nodes A/B are runtime qualified; final report `OJPLATFORM_2C8D_LOCAL_JUDGE_HOST_AGENT_ELASTIC_POOL_V1_REPORT.md`
PHASE 1C: PASS
PHASE 1D: PASS
PHASE 1E: HISTORICAL PASS / FINAL RERUN PARTIAL
PHASE 1E-R: RECOVERY CLOSED HISTORICALLY / FINAL RERUN PARTIAL
PHASE 2A: PASS / REAL MULTI-PROCESS QUALIFICATION COMPLETE
PHASE 2B: PASS / CLOSED
PHASE 2C: IN PROGRESS / C++20 REAL EXECUTION LIFECYCLE RELIABILITY QUALIFIED
PHASE 2C.2: PASS / REAL EXECUTION LIFECYCLE, INTEGRITY & RELIABILITY QUALIFIED
PHASE 2C.3: PASS / DETERMINISTIC SINGLE-TESTCASE EXECUTION & MEASUREMENT RECORD QUALIFIED
PHASE 2C.4: PASS / TESTCASE-SET EXECUTION-FACT AGGREGATION FOUNDATION QUALIFIED
REAL C++20 EXECUTION: QUALIFICATION ONLY
VERDICT ENGINE: 2C.5/2C.6 and Phase 3D authoritative verdict paths are implemented and qualified in their recorded scopes; the historical "NOT STARTED" wording is retained only in older reports
PHASE 2D: NOT STARTED
READY FOR NEXT PHASE 2C GOAL: YES

## Completed Goals

- PHASE 0A.1 — Project Bootstrap & Architecture Baseline: PASS
- PHASE 0A.2 — Root AGENTS.md Development Constitution: PASS
- PHASE 0A Governance Wave 1 — Governance Foundation: PASS
- PHASE 0A Governance Wave 2 — Reporting & Architecture Control: PASS
- PHASE 0A Security Foundation — Security Design Baseline: PASS
- PHASE 0B.1 — Repository & TypeScript Engineering Foundation: PASS
- PHASE 0B.2 — Application Platform & CI Foundation: PASS
- PHASE 0B.3 — Local Infrastructure & Platform Resilience: PASS
- PHASE 0B.3R — Docker Runtime Recovery & Resume Qualification: PASS WITH BACKEND FALLBACK
- PHASE 0B FINAL CLOSURE — Engineering Platform Qualification: PASS
- PHASE 1A — Core Product Foundation: PASS
- PHASE 1B — Authoring & Access Control Foundation: PASS
- PHASE 1C — Submission Intake Foundation: PASS
- PHASE 1D — Product Experience & UI Foundation: PASS
- PHASE 1E — Judge Protocol & Queue Foundation: PASS
- PHASE 2A — Real Judge Worker Foundation: PASS
- PHASE 2B — Sandbox Security Qualification: PASS
- PHASE 2C.1 — C++20 Real Compiler & Runtime Execution Foundation: PASS
- PHASE 2C.2 — Real Execution Lifecycle, Integrity & Reliability Qualification: PASS
- PHASE 2C.3 — Deterministic Testcase Execution & Runtime Measurement Contract: PASS
- PHASE 2C.4 — Testcase Set Execution & Aggregation Foundation: PASS
- PHASE 3C — Problem Judge Data Lead Integration & Guest Authoring: PASS
- PHASE 3D.1 — Submission Detail & Per-Testcase Results V1: PASS

## Current Project State

- Phase 2B Lead integration checkpoint: `6381784` (`feat: integrate phase 2B sandbox control plane`)
- Phase 2B qualification code/test commit: `e9f45e3` (`test: complete phase 2B final sandbox qualification`)
- Phase 2C.1 implementation commit: `0c230df` (`feat: add phase 2C.1 C++20 execution foundation`)
- Phase 2C.2 implementation commit: `74a9566` (`feat: harden phase 2C.2 execution lifecycle`)
- Phase 2C.2 qualification commits: `26cc692`, `9e17d7e`
- Phase 2C.4 implementation commit: `a3af407` (`feat: add phase 2c4 testcase-set execution foundation`)
- Phase 2C.4 qualification commit: `4856438` (`test: qualify phase 2c4 testcase-set reliability`)
- Phase 3C: 3A and 3B history-preserving merges `f9b3549` and `89dd6bf`; final Goal commit records Product/PostgreSQL/MinIO and Guest G1/G2 qualification.
- Product Lead Integration V1: `100e9f4` integration baseline plus `58c6b10` real browser smoke; final report records the closure commit. Judge history remains separate from this Product integration.
- Business implementation: Phase 1 product foundations, Phase 2A Worker foundation, Phase 2B trusted-probe Sandbox boundary, and the Phase 2C.1/2C.2/2C.3 qualification-only C++20 execution foundation implemented
- Framework/toolchain: initialized and qualified through the current Phase 2C.1 scope
- Local PostgreSQL/Redis/MinIO infrastructure: Docker Engine/Compose, Windows localhost API/browser boundary, and recovery behavior qualified with WSL instance kept alive
- Judge Worker: Phase 2A qualification complete; Phase 2B Sandbox boundary and Phase 2C.1/2C.2/2C.3 real C++20 queue/Worker path, attempt identity, retry, crash recovery, stale-result protection and deterministic testcase record publication qualified; no Application PostgreSQL access
- Sandbox: trusted-probe protocol remains available; gated 2C.1 source compilation and raw execution use the dedicated non-root Supervisor and separate rootless-runc lifecycles
- Runtime security controls: dedicated non-root Supervisor, rootless OCI/runc, systemd user manager, cgroup v2, namespaces, seccomp, and finite memory/pids limits qualified
- Runtime attack tests: integrated FS, NET, process/privilege, resource, lifecycle, cleanup-failure, crash, cancellation and concurrent-isolation matrices PASS
- Production security qualification: NOT CLAIMED; Phase 2B development-runtime trusted-probe scope only
- C++20 profile: fixed `cpp20-gcc-13-v1`, GCC 13.3.0, immutable source hash, fixed argv, bounded compile/runtime resources, verified static ELF artifact, attempt-owned lifecycle, and raw result only
- Phase 2C.2 reliability: source TOCTOU checks, rootfs hard preflight, artifact reverify, duplicate/retry/stale-result authority, cancellation races, startup residue ownership, sequential/concurrent soak, and restart recovery qualified
- Phase 2C.3 deterministic testcase contract: immutable testcase identity and exact testdata version, Supervisor-controlled stdin staging/reverify, fixed profile, monotonic wall time, cgroup CPU/memory/pids facts, bounded output metadata, proven termination facts, immutable record publication, 20-cycle repeatability, 10-pair concurrency and zero owned residue qualified
- Phase 2C.4 testcase-set foundation: immutable ordered manifests, exact testdata/snapshot binding, compile-once/run-many execution, independent per-testcase records/sandboxes, ordered aggregate facts, cancellation/no-launch semantics, retry/stale authority, Worker/Supervisor/API restart recovery, cross-testcase/cross-set isolation, 20 sequential sets, 10 concurrent pairs, critical security regression, and zero owned residue qualified
- Real C++20 execution: deterministic single-testcase and ordered multi-testcase execution-fact aggregation qualified; no verdict mapping, output comparison, checker, scoring, multi-language support, or production readiness claim
- TypeScript quality gates: PASS (format, lint, typecheck, 333 tests/4 opt-in skips, Redis opt-in 4/4, architecture, build, and 4/4 infrastructure integration)
- Real Web/API platform skeleton: AVAILABLE
- CI foundation: AVAILABLE (local workflow validation; remote run not observed)
- 0B.3 implementation and runtime qualification: PASS; see the final closure report
- 0B.3R recovery: after Windows restart, quarantining the exact Docker runtime directory allowed brief daemon recovery and WSL data-disk setup; registry pulls then failed because Docker Desktop lacked the verified host proxy, and a later restart reproduced runtime socket failure
- Docker Desktop recovery failures remain historical; they are superseded by the qualified WSL2 Docker Engine fallback.
- Post-interruption recheck: Desktop still crashes during `sailor-ingest.sock` initialization; `dockerDesktopLinuxEngine` is absent. `httpproxy.log` confirms host/Linux proxy disabled and registry direct connection. Official proxy configuration cannot be reached while Settings is unavailable, so 0B.3/0B.3R remain blocked.
- PHASE 0B.3R2 fallback: Docker Desktop was officially uninstalled after data-preservation recheck. Ubuntu 24.04 WSL2 official Docker Engine is now installed and daemon/image/integration qualification passes; Windows-to-WSL port forwarding blocks browser and full matrix completion.
- Boundary qualification: a non-privileged WSL keepalive process makes Windows localhost forwarding stable; direct VM-IP probes remain unavailable, with no portproxy or firewall changes.
- PHASE 0B.3R2 final qualification: FI-004..FI-018, CB-025/026, browser E2E, and full regression all PASS/FAIL_AS_EXPECTED as specified. 0B.3R2 = PASS; 0B.3R = PASS WITH BACKEND FALLBACK; 0B.3 = PASS.
- Reboot-boundary recheck: only `wsl --version` completed; `wsl --status`, distro listing, Ubuntu `uname`, and an Ubuntu shell probe each exceeded 30 seconds. Docker Engine installation and all Docker/runtime work remain stopped.
- PHASE 0B.3R3 WSL recovery: historical pre-reboot blocker; subsequent post-reboot acceptance is recorded as PASS and remains unchanged.
- 0B.3R3 follow-up: host last boot time is unchanged (`2026-08-26 22:49:27`); the second bounded probe set again timed out for WSL status/list, Ubuntu commands, and shutdown. Docker remains untouched.
- 0B.3R3 third recheck: the same WSL control-plane timeouts repeated for a third consecutive goal turn; `wsl --version` alone returns. Docker and Docker Engine work remain stopped pending an actual Windows reboot and elevated WSL diagnostics.
- PHASE 0B.3R3 post-reboot gate: Windows boot time advanced to `2026-08-27 13:25:20`; two complete WSL acceptance cycles passed, including Ubuntu 24.04 VERSION 2, interactive shell, and timely `wsl --shutdown`. Docker remains untouched and 0B.3R2 is now allowed to resume.
- PHASE 0B.3R3 independent requalification: the complete two-cycle WSL gate was rerun successfully; Docker remains untouched and 0B.3R2 resume is permitted.
- Latest WSL gate recheck: the required first and second cycles passed again after confirming the post-reboot boot time; Docker remains untouched.
- Latest WSL gate recheck 2: another complete two-cycle pass, including interactive shell and shutdown, confirms WSL stability; Docker remains untouched.
- Latest WSL gate recheck 3: another complete two-cycle pass confirms the same stable WSL result; Docker remains untouched.
- Known risks: Sandbox escape, Judge credential compromise, hidden-testdata leakage, authorization defects, plugin compromise, storage exposure, queue/result spoofing, DoS, supply chain, secret leakage, unsafe imports, and audit gaps remain OPEN in the risk register

## Next Planned Goal

Unified Judge Runtime Integration V1 is closed. The explicitly deferred global
evaluation-list backend and explicit problem capability projection remain out of
scope for the next approved Goal. Product E2E multi-language support, Contest,
production HA, and production deployment are not qualified; Phase 2D is not
started.

Last Updated: 2026-09-05

JUDGEDATA ARTIFACT PIPELINE V1 (2026-09-05): PASS. Real authenticated 100 MiB
raw ZIP upload, validate/publish, Product reference dispatch, Judge claim,
MinIO checksum fetch, Supervisor opaque-handle execution, and terminal AC passed
on current worktree. ADR 0006 ACCEPTED. See
`Docs/reports/OJPLATFORM_JUDGEDATA_ARTIFACT_PIPELINE_V1_REPORT.md`.

Recent Remediation Final Integration V2: PARTIAL. OJ and plugin main merges are
complete; root checkouts align to main. Integration contains launcher status/stop, JudgeData
execution reliability V2, submission/live-evaluation UX V2, and plugin hosted
editor fixes including 320px minimum height. Fresh-worktree dependency linking
hit `ERR_PNPM_EEXIST/EBUSY`; focused validation is NOT VERIFIED. Runtime/browser
qualification remains NOT YET VERIFIED. Root status smoke is visible with
services DOWN; shared registry points to an older product worktree pending the
user's next Start. See
`Docs/reports/OJPLATFORM_RECENT_REMEDIATION_FINAL_INTEGRATION_V2_REPORT.md`.

Canonical Runtime Source V1 implementation: PARTIAL pending runtime
qualification. See `Docs/reports/OJPLATFORM_CANONICAL_RUNTIME_SOURCE_V1_REPORT.md`.
Normal runtime resolves canonical product/plugin `main` worktrees through the
shared registry, records source/version identity, rejects dirty or unregistered
explicit sources, and performs version-aware reuse. Runtime/browser proof is
not verified in this implementation pass.

Dual Repository Consolidation V1 (2026-09-04): PASS. Canonical OJPlatform
`main` starts from the Final Feature Integration history, includes the WSL
runtime-qualification evidence, and has no required unmerged branch. Canonical
OnlineCodeEditor `main` is `560a5ae`; all plugin branches are ancestors. See
`Docs/reports/OJPLATFORM_DUAL_REPO_CONSOLIDATION_V1_REPORT.md`.

WSL Docker + Runtime Final Qualification (2026-09-04): PASS. Ubuntu-24.04
ordinary-user Docker access was repaired through the `docker` group and
verified without sudo. Runtime port reconciliation branch `fa82b98` passed
real start/reuse/stop/stop-all recovery with PostgreSQL, Redis, MinIO,
Supervisor, Host Agent, Worker and Web evidence; current unified checkout also
started successfully after targeted stale Worker recovery. See
`Docs/reports/OJPLATFORM_WSL_DOCKER_RUNTIME_FINAL_QUALIFICATION_REPORT.md`.

Local Runtime Manager V1: PASS / LOCAL RUNTIME QUALIFIED. Canonical
PowerShell/BAT startup, shutdown, status, logs and doctor tooling is present with
ignored runtime state, generated local tokens, migration ledger, WSL Compose reuse,
named delegated non-root Supervisor startup, dependency-aware Product API/Judge
Service parallel launch, and Host-Agent-owned worker control. Start/restart/stop,
Stop -> Start recovery, infrastructure reuse, migration idempotency, Supervisor
readiness, Worker ONLINE and real AC/WA/CE/RE/TLE/MLE qualification passed on the
current machine. Existing Product/browser A+B evidence remains the application
qualification reference; a fresh browser rerun was not part of this manager-only
change.

Runtime Reliability + Real Qualification V1 (2026-09-05): PARTIAL pending
user-run browser qualification. JudgeData ZIP transport now uses bounded raw
application/zip parsing, fixing the multi-megabyte base64/giant-regex stack
overflow. Runtime Manager now exposes and qualifies the execution-set
contract, rebuilds stale Supervisor binaries from the selected feature source,
and reports Web/API/Judge/Host Agent/Supervisor plus REAL_SANDBOXED_EXECUTION
Worker healthy with MIXED SOURCE = False. Focused JudgeData/Web tests (30),
TypeScript typecheck, and Worker tests (64) pass. Supervisor Go suite remains
partial because Windows cannot compile trusted-probe syscall code and four
existing root/cgroup fixture tests fail. Browser ZIP persistence/Validate and
live SSE terminal-chain evidence were delegated to the user. See
Docs/reports/OJPLATFORM_RUNTIME_RELIABILITY_V1_REPORT.md.

Runtime Reliability V1 main integration (2026-09-05): source branch
`codex/runtime-reliability-v1` merged normally into canonical `main` as
`c7dc9de4edfbaf98de7d9a7398c801360a313ab0`. Root checkout is aligned to
`main`; existing user untracked artifacts were preserved. Focused JudgeData and
Runtime Manager tests, Web typecheck/build, Worker tests, PowerShell parse, and
diff check pass. Supervisor remains PARTIAL for known Windows syscall and
root/cgroup fixture failures. Feature Runtime stop was BLOCKED by an existing
Runtime Manager mutex; no manual termination performed. Browser ZIP persistence,
Validate, formal resubmission, and real SSE terminal-chain evidence remain
NOT VERIFIED and user-owned.

Stop Manual Recovery V2 (2026-09-05): PASS. Branch
`codex/stop-manual-recovery-v2` merged normally into canonical `main` with
structured BLOCKED/PARTIAL stop outcomes, listener ownership diagnostics, and
manual recovery guidance. See `Docs/reports/OJPLATFORM_STOP_MANUAL_RECOVERY_V2_REPORT.md`.
