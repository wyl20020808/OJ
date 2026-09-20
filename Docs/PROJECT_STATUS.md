# OJPlatform Project Status

Phase 7C Windows Physical-Host Functional Qualification (2026-09-20): PASS for current-host functionality and idempotency; overall Phase 7C remains PARTIAL / CLEAN-HOST BLOCKED. A dedicated isolated `OJPlatform-Phase7C-Functional` WSL2 distro (Ubuntu 24.04.5, systemd PID 1, ext4 VHDX on `D:`) completed the Windows installer and a second full installation without modifying existing distros or host boot/hypervisor/firewall configuration. Installer defects found and fixed: silent PowerShell native stderr handling, unsafe multiline WSL argument transport, unbounded/invisible apt work, wrong existing-distro disk target, WSL-warning numeric parsing, clone diagnostics/retries, npm registry configurability, Linux doctor startup race, and stale nginx Docker DNS after API recreation. Both `DEPLOY_DOCTOR=PASS` and `WINDOWS_DEPLOY_DOCTOR=PASS`; localhost Web/API returned 200 and the startup task was registered. Real verified registration/session/CSRF/problem/Judge-data/DB/queue/Judge flows produced post-second-install AC `87445428-87d5-4fc2-9a04-9a1ae476ded3`, WA `1cf539e2-6052-4070-8159-af71737cb0e0`, TLE `a7b2e097-8928-46b0-8e9c-7527d00e99cf`, MLE `2d67d59c-260d-44dd-901d-8907d2783f21`, CE `6970691b-0b65-47e2-b6d7-e8db38dc0bd1`, and RE `172c831d-0a22-466f-8912-39fc2f75b624`. Windows Edge verified CodeMirror DOM and keyboard input with zero uncaught page errors. Repository/plugin/environment/volume fingerprints persisted; qualification-only mail infrastructure was removed and production doctors passed afterward. Rejudge is NOT VERIFIED (Judge Service 409 surfaced by API as 503); cancel was not run. PowerShell parsing, 52/52 focused deployment contracts, typecheck, build, changed lint/format, and diff checks pass. Clean no-Git bootstrap, real Windows reboot/resume, clean-host idempotency, integration/publication, and public-main bootstrap remain NOT VERIFIED because no usable nested Windows VM exists. `WINDOWS_PHYSICAL_HOST_FUNCTIONAL=PASS`; `WINDOWS_CURRENT_HOST_IDEMPOTENCY=PASS`; `WINDOWS_CLEAN_HOST_QUALIFICATION=BLOCKED`. See `Docs/reports/OJPLATFORM_PHASE7C_WINDOWS_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

Phase 7C Existing Local Windows VM Discovery (2026-09-20): BLOCKED / NO USABLE WINDOWS VM. Re-audited actual host rather than carrying forward the earlier VMware assumption. Host is physical MSI Z790 x86_64 on Windows 11 Home China build 26200; Microsoft hypervisor and VBS/HVCI are active, WSL 2.7.12 currently runs `docker-desktop` and `Ubuntu-24.04` as WSL2. VMware Workstation 17.6.4 is installed; VirtualBox/QEMU/Multipass/Parallels are absent. VMware registered inventory, `vmrun`, recent configuration and normal VM directories contain exactly four stopped Ubuntu x86_64 VMs: NativeLinux base (one `clean-base` snapshot), NativeLinux qualification, Phase 7A and Phase 7B; all have `vhv.enable=FALSE`. No Windows 11/10 VM or Windows snapshot exists to inspect or clone. Full Hyper-V VM management is unavailable: Windows Home has neither the Hyper-V PowerShell module nor `Get-VM`, so there is no general Hyper-V Windows VM to clone and enable with `Set-VMProcessor`; this is distinct from the active Microsoft hypervisor used by WSL. VMware rejects `vhv.enable=TRUE` with `This platform does not support virtualized Intel VT-x/EPT` while the host Microsoft hypervisor/VBS stack is active, so a new VMware Windows guest cannot run WSL2. Only remaining local path is temporarily disabling the Microsoft hypervisor boot launch, rebooting, qualifying a disposable nested VMware Windows guest, restoring the exact original boot configuration, and rebooting again. No host boot/Hyper-V/WSL/VBS/Memory Integrity/firewall setting was changed and no base VM was modified. Phase 7C remains PARTIAL; runtime qualification did not start. See `Docs/reports/OJPLATFORM_PHASE7C_WINDOWS_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

Phase 7C Windows Foolproof One-Command Deployment + Bilingual README V1 (2026-09-20): PARTIAL / IMPLEMENTED / CLEAN-HOST QUALIFICATION BLOCKED on `codex/phase7c-windows-one-command-deployment-v1`, based on public main `d785b36aab5306c31f774344394e87899a74c981`, implementation commits `8a0ee5a` and `6546ddd`. Added PowerShell 5.1 Windows bootstrap, fresh-no-Git winget bootstrap, read-only Windows doctor, bounded secret-free reboot resume, automatic systemd/WSL2 Ubuntu 24.04 initialization, WSL ext4 public recursive clone, delegation to authoritative Linux `deploy/install.sh`, localhost validation, credential-free WSL startup task, and concise bilingual landing plus full Chinese/English READMEs. No Windows-native Judge/DB/systemd replacement, second Compose architecture, Docker Desktop dependency, firewall weakening, permanent sudo exemption, or `/mnt/c` production checkout was added; existing Windows development Runtime Manager is untouched. PowerShell parsing, 50/50 focused Phase 7B/7C deployment contracts, typecheck, production build, architecture gate, changed lint/format and diff checks pass. Full Vitest retains unrelated baseline Web failures (82 files passed, 15 failed, 1 skipped; 995 tests passed, 47 failed, 10 skipped); no Phase 7C test failed. Final runtime evidence is BLOCKED: available disposable VMs are Linux only; a new official Windows 11 Enterprise Evaluation x64 VMware candidate was attempted but VMware rejected nested VT-x/EPT while host Hyper-V/WSL is active, so WSL2 cannot run inside that clean guest; host is Windows Home without Hyper-V VM management and no external/cloud nested Windows host is available. Disabling/restoring the host hypervisor requires explicit approval and two disruptive host reboots. Fresh Windows install, no-Git bootstrap, auth/CSRF, AC/WA/resource verdicts, Windows browser editor, second install, real Windows reboot, integration and publication remain NOT VERIFIED/PENDING. No Windows PASS claim was merged or pushed. See `Docs/reports/OJPLATFORM_PHASE7C_WINDOWS_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

Phase 7B One-Command Production Deployment V1 - Final Integration, Publication and Public Qualification (2026-09-19): PASS / MERGED / PUBLISHED. Feature history was integrated from the latest live main with `--no-ff`; the qualified code tip is `ff8f030cb4592038cdcefc014cb97f5fc2944d52` and pinned OnlineCodeEditor is `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`. Typecheck, builds, architecture, changed-file lint/format, deployment contracts, Judge qualification, plugin validation, shell syntax/shellcheck and diff gates passed. Gitleaks and manual history/tree review found no real secret, credential file, production dump, VM image, suspicious large blob on main or required machine-specific path. Only main was pushed without force; anonymous ls-remote and recursive clone reproduced both commits. Two Ubuntu production qualifications passed real email verification/register/login, browser session/CSRF, same-origin Submission API, real DB/queue/Judge AC+WA, CodeMirror typing, persistence, reboot recovery, doctor, second-install idempotency and post-install AC. The final independent Ubuntu 24.04.5 guest cloned only the public repository; retained AC `78b64c1b-0e0c-444a-ad1b-0aa03978bbfc` and WA `df7fca59-0acf-43ec-ac3b-84e073c441df` across reboot, then produced post-second-install AC `8ff19d87-9802-4e65-a760-f74f97ba14be`. Disposable mail sinks/overrides and qualification-only passwordless sudo entries were removed. `PHASE_7B = PASS`; `ONE_COMMAND_DEPLOYMENT = QUALIFIED`; `REBOOT_SURVIVAL = PASS`; `DEPLOYMENT_IDEMPOTENCY = PASS`; `PUBLIC_REMOTE_QUALIFICATION = PASS`. Linux ARM64 remains NOT QUALIFIED; Mac Judge remains NOT TARGET; Phase 5 Mac remains DEFERRED. See `Docs/reports/OJPLATFORM_PHASE7B_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

Docker Phase 6A Judge Architecture + Sandbox Security Audit V1 Integration (2026-09-18): PASS. Fresh candidate `b487dfd` merged feature tip `7b7263f` (`codex/docker-phase6a-judge-architecture-v1`) into live main baseline `014ce58` with `--no-ff`; the only conflict was the additive `Docs/PROJECT_STATUS.md` record, resolved semantically without whole-file ours/theirs, and the merged tree keeps both the earlier main date correction and the Phase 6A audit record. Audited verdict preserved: audit PASS, current topology and trust boundaries understood, no Product/Judge DB credential in Worker or Sandbox, no Docker socket required, sandbox network/filesystem/process/cgroup PASS at audit level, fail-closed preflight PASS, compiler rootfs integrity PASS. Recommended architecture preserved: containerized Judge control plane (bootstrap/migrate/Judge Service) plus a native Linux amd64 Host Agent/Worker/Supervisor/rootless-runc execution cell. Two HIGH production blockers remain open: live WSL `oj-sandbox` Docker-group membership, and service-mode Worker shared ACL-less Redis. Controlled Phase 6B may start; production Judge qualification may not. Phase 6B model remains GPT-5.6 Sol + high reasoning. No real Submission, DB write, cgroup/rootfs/systemd change, Worker/Supervisor/Host Agent code change, Dockerfile, or Compose change was performed. See `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md` and `Docs/reports/OJPLATFORM_DOCKER_PHASE6A_JUDGE_ARCHITECTURE_SECURITY_AUDIT_V1_REPORT.md`.

Docker Phase 6A Judge Architecture + Sandbox Security Audit V1 (2026-09-18): PASS on `codex/docker-phase6a-judge-architecture-v1`; not merged. Current Product API -> Judge Service -> Worker -> loopback non-root Supervisor -> rootless runc topology, credentials, DB isolation, namespaces/cgroup/filesystem/network/process controls, compiler rootfs, platform boundaries, and Phase 6B regression/implementation plan are documented. Recommended deployment containerizes the Judge control plane while retaining Host Agent/Worker/Supervisor as a native Linux amd64 execution cell. High deployment findings: the live WSL `oj-sandbox` account has unnecessary Docker-group membership, and service-mode Worker currently has shared unrestricted Redis access; both must be closed before production qualification. Phase 6A performed no real Submission, runtime mutation, DB write, rootfs/cgroup change, or main merge. See `Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md` and `Docs/reports/OJPLATFORM_DOCKER_PHASE6A_JUDGE_ARCHITECTURE_SECURITY_AUDIT_V1_REPORT.md`.

Token Optimization V1 finalization (2026-09-18): PASS. Previous working-tree blocker resolved. Validated candidate entered `main`. `AGENTS.md` runtime token optimization rules were preserved and committed separately. Canonical root is on `main`; working tree was clean at finalization.

Durable Project Memory Token Optimization V1 Integration (2026-09-17): PARTIAL — BLOCKED_BY_USER_WORKING_TREE. A fresh candidate `739dc35` merged the single-commit `codex/project-memory-token-optimization-v1` feature (`cffb814`) into live main baseline `cc42422` with `--no-ff`; zero conflicts and the merged tree is identical to the validated feature tip. Validation passed: `AGENTS.md` is handoff-first with history triggers A-E and a context-budget rule, `Docs/OJPLATFORM_CURRENT_HANDOFF.md` is 100 lines of hot state only, and `Docs/PROJECT_STATUS.md` plus historical reports are on-demand rather than default startup context. `refs/heads/main` required one extra step at authoring time: the fast-forward was refused because the canonical root held an uncommitted user edit to `AGENTS.md` that it would overwrite (`Your local changes ... would be overwritten by merge`), so the edit was preserved untouched and the validated candidate was left ready for a one-command `--ff-only` finalization. Phase state is unchanged: Phase 0 audit DONE with its original PARTIAL verdict, Phase 1-4 PASS/merged, Phase 5 PARTIAL with the Mac lane deferred, Phase 6 NOT STARTED and still cleared for Windows/WSL2 with GPT-5.6 Sol + high reasoning. No business code, Docker implementation, migration, or runtime was touched. See `Docs/reports/OJPLATFORM_DURABLE_PROJECT_MEMORY_TOKEN_OPTIMIZATION_V1_INTEGRATION_REPORT.md`.

Durable Project Memory Token Optimization V1 (2026-09-17): PASS for documentation/governance scope. `Docs/OJPLATFORM_CURRENT_HANDOFF.md` was compressed from 286 to 100 lines and is now explicitly HOT STATE (unfinished work, blockers, boundaries, next action, model) rather than a history summary; Phase 0-4 detail was intentionally moved out because it already exists in this log and the phase reports. Root `AGENTS.md` now bootstraps on live Git check plus the handoff only, treats `Docs/PROJECT_STATUS.md` as a history log read on demand, lazily loads historical reports, and carries a context-budget rule. No phase state changed: Phase 0 audit DONE with its original PARTIAL verdict, Phase 1-4 PASS/merged, Phase 5 PARTIAL with the Mac lane deferred, Phase 6 NOT STARTED and still cleared for Windows/WSL2 with GPT-5.6 Sol + high reasoning. No business code, Docker implementation, migration, runtime, or `main` merge was performed.

Durable Project Memory Bootstrap V1 Integration (2026-09-17): PASS. Fresh candidate `7f49d1c` merged the two-commit `codex/project-memory-bootstrap-v1` feature (`7193ee0`, `7135885`) into live main baseline `b7dad60` with `--no-ff`; zero conflicts and the merged tree is identical to the validated feature tip. Root `AGENTS.md` now requires a Git live-check plus handoff/status reads before any substantial task, and forbids relying on chat memory to recover project state. Docker state remains unchanged by this integration: Phase 0 audit DONE with its original `DOCKER READINESS = PARTIAL` verdict, Phase 1-4 PASS, Phase 5 PARTIAL with the Mac lane deferred, Phase 6 NOT STARTED while cleared to proceed on Windows/WSL2 with GPT-5.6 Sol + high reasoning. No business code, Docker implementation, Compose file, migration, runtime process, or Phase 5/6 work was touched; the Phase 5 branch, the three stashes, and all prior worktrees were preserved. See `Docs/reports/OJPLATFORM_DURABLE_PROJECT_MEMORY_BOOTSTRAP_V1_INTEGRATION_REPORT.md`.

Durable Project Memory + Automatic Handoff Bootstrap V1 (2026-09-17): PASS for documentation/governance scope. Root `AGENTS.md` now requires every substantial task to live-check Git and read `Docs/OJPLATFORM_CURRENT_HANDOFF.md` plus this file before acting, and forbids depending on chat/session memory to recover project state. Recorded Docker phase state: Phase 0 readiness audit DONE with report status PARTIAL, Phase 1-4 PASS (Phase 2-4 merged), Phase 5 PARTIAL (Windows WSL2 amd64 lane PASS; Mac Intel and Mac Apple Silicon NOT TESTED; Phase 5 MUST NOT be marked PASS without real Mac evidence), Phase 6 Judge Docker not started but cleared to begin on Windows/WSL while the Phase 5 Mac lane is deferred. Phase 6 model recommendation recorded as GPT-5.6 Sol with high reasoning. No business code, Docker implementation, database migration, or `main` merge was performed in this task; `main` remained at `b7dad60`. See `Docs/OJPLATFORM_CURRENT_HANDOFF.md`.

Docker Phase 4 Web Container + Nginx Reverse Proxy V1: PASS on `codex/docker-phase4-web-container-v1`. Windows Docker/Chrome qualification passed portable OnlineCodeEditor bundling, non-root/read-only Nginx, SPA/API/ready routing, fresh and second Core startup, cache/compression, API failure behavior, and isolated Phase 1/2/3 regression checks. Main merge was not performed. See `Docs/reports/OJPLATFORM_DOCKER_PHASE4_WEB_CONTAINER_V1_REPORT.md`.

Docker Phase 4 Web Container V1 Integration (2026-09-17): PASS. Fresh candidate `b18bea8` merged the two-commit `codex/docker-phase4-web-container-v1` feature (tip `8d982bf`, feature `a748aaa`) into live main baseline `5868c72` with `--no-ff`; zero conflicts and the merged tree is identical to the qualified feature tip. WSL2 Docker qualification re-proved Web and API image build/rebuild, non-root read-only Nginx runtime, `nginx -t`, SPA fallback for `/problems`, `/blog`, `/contests`, `/homework`, `/submissions`, real `/api/*` and `/ready` reverse proxying with 503 degradation and 200 recovery, static asset and gzip/cache policy, bundle host-path and Vite-dev-client leak audit, real Chrome root and deep-link navigation with zero direct API leaks, OnlineCodeEditor plus CodeMirror mounting inside the Docker-served bundle, fresh Core startup, second no-op migration startup, MinIO persistence, Web health and graceful shutdown, and Phase 1/2/3 regression gates including runtime DB role isolation and disposable migration qualification. Phase 4's portable OnlineCodeEditor build context was verified to contain no fixed host drive path. Only disposable `ojplatform-phase4-integration-qualification` containers, networks, and volumes were removed; the legacy Runtime Manager, real development data, and the three existing stashes were untouched. See `Docs/reports/OJPLATFORM_DOCKER_PHASE4_WEB_CONTAINER_V1_INTEGRATION_REPORT.md`.

Docker Phase 3 API Container V1 Integration (2026-09-16): PASS. Fresh candidate `c5e0cf6` merged `codex/docker-phase3-api-container-v1` into live main baseline `5891377` with `--no-ff`, no conflicts. WSL2 real integration qualification passed API image build, fresh disposable Product DB migration, migration failure gate, PostgreSQL/Redis/MinIO readiness, runtime credential DDL denial, second no-op startup, Redis readiness recovery, graceful shutdown, Compose port policy, and Phase 1/2/API regression gates. Only disposable `ojplatform-phase3-integration-qualification` resources were removed; legacy Runtime Manager, user data, and Docker daemon proxy configuration were untouched. See `Docs/reports/OJPLATFORM_DOCKER_PHASE3_API_CONTAINER_V1_INTEGRATION_REPORT.md`.

Docker Phase 3 API Container + One-Shot Migration Services V1 (2026-09-16): PASS on `codex/docker-phase3-api-container-v1`. WSL2 Docker Engine real qualification passed: Node image pull, API image build/rebuild, non-root/read-only API runtime, fresh isolated Product migration, migration failure gate, PostgreSQL/Redis/MinIO readiness, bucket bootstrap, public API smoke, dependency recovery, runtime DB DDL denial, second no-op startup, graceful shutdown, image secret audit, and Phase 1/2 regressions. Initial qualification was blocked solely because Docker daemon retained stale proxy `127.0.0.1:10809` after xray moved to `127.0.0.1:10808`; user repaired only the daemon drop-in. Dev overlay now gives API a dev-only ingress network so Docker publishes its loopback port while Product infrastructure remains internal and production publishes no ports. Qualification used only disposable `ojplatform-phase3-qualification` resources, all removed after evidence capture.

Docker Phase 2 Migration Architecture V1 Integration (2026-09-16): PASS. Fresh candidate from live `main` `ed389ea` merged feature tip `19d5aba` normally with `--no-ff` as `ea4e526`; no conflicts and no historical migration SQL changes. Disposable PostgreSQL 16.4 qualification passed Product/Judge ledgers, 0020 replay prevention, `0019` upgrade, explicit adoption, rollback/retry, checksum fail-closed, concurrent migrators, isolation, runtime wrapper, and Judge runtime-role boundary. Targeted migration tests, typecheck, architecture, build, formatting/lint, and base/dev/prod Compose rendering pass. See `Docs/reports/OJPLATFORM_DOCKER_PHASE2_MIGRATION_ARCHITECTURE_V1_INTEGRATION_REPORT.md`.

Docker Phase 2 Migration Architecture V1 (2026-09-16): PASS on `codex/docker-phase2-migration-architecture-v1`. Product and Judge now share a fixed-manifest, SHA-256-protected, transaction-per-file runner with the compatible `_ojplatform_runtime_migrations` ledger, fail-closed adoption, session advisory locking, distinct public CLIs, and Runtime Manager wrappers. Isolated PostgreSQL 16.4 qualification passed fresh Product/Judge, second-run no-op, `0019` through `0020` upgrade, legacy ledger/adoption, rollback/retry, checksum mutation, concurrent runner WAIT, cross-DB isolation, and Judge runtime DDL denial. `0020` replay root cause reproduced as `42P07` on `judge_artifacts`; historical SQL remained unchanged. Current stopped real DB was not cloned or modified. Phase 1 Compose config regressed cleanly; no application service was containerized. See `Docs/reports/OJPLATFORM_DOCKER_PHASE2_MIGRATION_ARCHITECTURE_V1_REPORT.md`.

Docker Readiness Audit + Cross-Platform Deployment Blueprint V1 (2026-09-16): PARTIAL. Live `main` audit found existing WSL-managed infrastructure Compose for PostgreSQL, Redis, and MinIO only; no application Dockerfiles or production Compose exist. Web/API are conditionally containerizable after loopback/plugin-path and migration-contract work. Judge is Linux/WSL/rootless-runc/cgroup/rootfs dependent and must remain an optional, separately qualified profile; Docker Desktop and Apple Silicon Judge support are not claimed. No runtime, process, database, migration, fixture, Docker configuration, or Git history was changed. See `Docs/reports/OJPLATFORM_DOCKER_READINESS_AUDIT_V1_REPORT.md`.

Docker Phase 1 Infrastructure Compose V1 Integration (2026-09-16): PASS. Fresh candidate from live main merged `0ae4bc9` and `5061eb7` normally with `--no-ff`, no conflicts. Base/dev/prod Compose static validation, production private-port rendering, isolated Windows-hosted WSL Docker PostgreSQL/Redis/MinIO health and probes, Compose DNS, PostgreSQL/MinIO normal shutdown/startup persistence, PostgreSQL restart recovery, legacy Compose config, Prettier, and diff checks pass. Existing Runtime Manager, legacy containers/volumes, migrations, fixtures, and application container scope were preserved. Canonical root user edits and untracked audit report remain protected. See `Docs/reports/OJPLATFORM_DOCKER_PHASE1_INFRASTRUCTURE_COMPOSE_V1_INTEGRATION_REPORT.md`.

Docker Phase 1 Infrastructure Compose V1 (2026-09-16): PASS on `codex/docker-phase1-infrastructure-compose-v1`. Added independent cross-platform Compose base/dev/prod files for PostgreSQL 16.4, Redis 7.4.1, and MinIO; development publishes loopback-only compatible ports while production rendering has no infrastructure host ports. Isolated Windows-hosted WSL Docker qualification passed real healthchecks, PostgreSQL and MinIO normal `down`/`up` persistence, PostgreSQL restart recovery, and Compose DNS; qualification volumes were removed afterward. Existing Runtime Manager and legacy Compose remain unchanged; no migration, fixture, application container, or real secret was added. macOS/Linux runtime qualification remains deferred. See `Docs/reports/OJPLATFORM_DOCKER_PHASE1_INFRASTRUCTURE_COMPOSE_V1_REPORT.md`.

Blog Comment UI Repair V1 Integration (2026-09-14): PASS. Fresh candidate `8a25f93` merged feature commit `4b609ac` into live main base `fa0c262` with normal `--no-ff`. The sole conflict in `Docs/PROJECT_STATUS.md` was resolved semantically by retaining both current Contest integration records and the Blog Comment UI record; no UI, API, Auth, or Comment contract file needed conflict resolution. Candidate-focused Vitest passed 21/21, candidate-served responsive Playwright passed 3/3, typecheck, Web build, targeted ESLint/Prettier, and diff check passed. Existing root edits, untracked files, stashes, and worktrees were preserved. Manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_BLOG_COMMENT_UI_REPAIR_V1_INTEGRATION_REPORT.md`.

Contest Full Experience V1 Integration (2026-09-14): PASS. Fresh candidate `f7f581b` merged Feature commits `a359d40`, `3e2d524`, and `77e182d` into live Main base `21d6248` with normal `--no-ff`; no conflicts. Contest focused Web/PostgreSQL/fixture/API tests passed 20/20; targeted ESLint/Prettier, typecheck, API build, Web build, targeted migration, real local PostgreSQL, and isolated candidate API validation passed. Standings remains explicit HTTP 503 `SCORING_ENGINE_NOT_INTEGRATED`. Browser acceptance is deferred to user and is not a merge blocker. See `Docs/reports/OJPLATFORM_CONTEST_FULL_EXPERIENCE_V1_INTEGRATION_REPORT.md`.

Contest Full Experience + Backend Data Synchronization V1 (2026-09-14): PASS on `codex/contest-full-experience-v1`. Contest landing/detail now consume authoritative enriched Contest projections and a 3-running/6-upcoming/15-finished home summary; participant/problem counts, organizers, registration state, status, and times come from PostgreSQL. A guarded localhost-only fixture seeds 24 contests, 8 organizers, 320 participant accounts, and deterministic relations with exact provenance and scoped cleanup. Focused Web/PostgreSQL tests 20/20, real Chrome E2E 1/1 across desktop/tablet/mobile, root typecheck, changed-file lint, API/Web builds, real PostgreSQL, and isolated current-branch API verification pass. Standings remains explicitly unavailable because the scoring engine is not integrated. The shared Runtime Manager safely refused a checkout switch while Judge active-job state was unknown; no process was manually killed. Manual UI acceptance remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_CONTEST_FULL_EXPERIENCE_V1_REPORT.md`.

Blog Comment UI Repair V1 (2026-09-14): PASS for scoped engineering and real-browser comparison on `codex/blog-comment-ui-repair-v1`. Discussion-owned comment UI now uses a compact natural-flow thread, functional heat/time sorting, header-adjacent authenticated composer, deterministic local fallback portraits, muted inline actions, and lightweight nested replies without changing Comment/Auth/API contracts. BEFORE/AFTER evidence used a `1484 × 1060` physical browser capture at DPR `1.25`; nested reply height fell from about `150px` to `85px`, thread height from about `295px` to `166px`, and the former `450/573px` internal scroll region became `319/319px` page flow. Focused tests pass `21/21`; real-runtime responsive Playwright passes `3/3`; typecheck, targeted lint/format, Web build, and diff check pass. Manual UI acceptance remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_BLOG_COMMENT_UI_REPAIR_V1_REPORT.md`.

Evaluation Records Screenshot Repair V1 Integration (2026-09-13): PASS. Fresh candidate `codex/evaluation-records-integration-v1` started from live main `7eccce8`, merged Feature commits `a25af2f` and `00e39ad` with normal no-ff merge `ffddbce`, then fast-forwarded `main` to that merge. No conflicts. Typecheck, API/Web builds, focused Evaluation/API tests, PostgreSQL integration, real local API search/statistics checks, fixture guard, and runtime health checks pass. Existing untracked files, three stashes, and worktrees were preserved. Manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_EVALUATION_RECORDS_INTEGRATION_V1_REPORT.md`.

Evaluation Records Screenshot Repair V1 (2026-09-13): PASS for engineering visual, functional, and real-database scope on `codex/evaluation-records-screenshot-repair-v1`. The page now matches the supplied `1478 × 1064` reference hierarchy with authoritative summary/rail analytics, complete submission metrics, server-side filters/search/pagination, interactive chart descriptions, and responsive contained overflow. An opt-in local-only fixture seeds 11,900 deterministic mixed records and never runs on production paths. Focused Web/API/PostgreSQL tests, typecheck, changed-file lint, API/Web builds, managed runtime restart, real browser state checks, and exact-size screenshots pass. Manual final review remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_EVALUATION_RECORDS_SCREENSHOT_REPAIR_V1_REPORT.md`.

Blog Screenshot Repair Integration V1 (2026-09-13): PASS. Live main `08af695` did not contain feature commit `e8110cf`; fresh candidate `codex/blog-screenshot-repair-integration-v1` merged it with normal no-ff merge `073d881` and no conflicts. Root typecheck, Web build, focused Blog unit tests `8/8`, candidate-served Playwright E2E `4/4`, and diff checks pass. Feature history, existing untracked files, three stashes, and all pre-existing worktrees were preserved. Canonical root was returned to main with tracked files clean; manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_BLOG_SCREENSHOT_REPAIR_INTEGRATION_V1_REPORT.md`.

Blog Screenshot Repair V1 (2026-09-13): PASS for engineering visual scope on `codex/blog-screenshot-repair-pass`. At a reference-matched `1484 × 1060` CSS viewport, live Blog cards dropped from about `220px` to `117–121px`, thumbnails now remain `16:9`, Meta is a stable horizontal row, dates no longer wrap, the three-column ratio matches the supplied reference, and mobile has no horizontal overflow. Focused Blog unit tests `8/8`, Playwright E2E `4/4`, TypeScript, focused lint, Web build, and diff checks pass. Manual final review remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_BLOG_SCREENSHOT_REPAIR_V1_REPORT.md`.

Problem Library Quality Integration (2026-09-13): PASS. Feature commits `b4be347` and `ba91684` were integrated from a fresh candidate based on live main with normal no-ff merge `9e8fd41`, no conflicts, and no backend or unrelated-page changes. Focused Problem Library tests pass 38/38; root typecheck, Web build, and diff check pass. Problem Library remains feature-owned, uses ten-item server pagination, canonical single-select tags, authoritative statistics, and feature-local CSS. Existing untracked files, stashes, and worktrees were preserved. Manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_PROBLEM_LIBRARY_QUALITY_INTEGRATION_REPORT.md`.

Problem Library UI + Full Experience Quality V2 (2026-09-13): PASS for the requested Problem Library engineering scope on `codex/problem-library-quality-v2`. The page is feature-owned, matches the supplied `1448 × 1086` reference hierarchy, reuses the canonical shared tag selector, uses ten-item server pagination with numeric navigation, contains long content and responsive overflow, and exposes honest disabled states for unsupported contracts. Real-browser tag/search/difficulty/source/sort/pagination/empty/error/recovery/responsive checks passed against 27 local public problems; focused tests pass 38/38, root typecheck, changed-file lint, Web build, and diff checks pass. Existing development fixtures remain opt-in/local-only and no records or fabricated statistics were added. Manual final review remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_PROBLEM_LIBRARY_UI_FULL_EXPERIENCE_QUALITY_V2_REPORT.md`.

Home UI Quality Pass V1 (2026-09-13): PASS for engineering visual scope on `codex/frontend-ui-quality-pass`. Real Codex in-app browser screenshots were compared with `Goals/首页界面.png` at matching `1448 × 1086` viewport geometry. Home now uses a clean existing mountain asset, reference-width grid and card baselines, stable long-title handling, consistent local SVG icons, compact fortune details, Home-only search focus, and a non-overflowing mobile menu overlay. DOM, Console, Network, hover, notification, loading, error, mobile, and fortune states were checked. Focused Home test 1/1, typecheck, Web build, and diff checks pass. Manual UI acceptance remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_HOME_UI_QUALITY_PASS_V1_REPORT.md`.

Blog Full Experience V1 (2026-09-12): PASS for the requested Blog display/data scope on feature branch `codex/blog-full-experience-v1`. Discussion now provides explicit content kinds, categories, tags, covers, featured/pinned metadata, viewer-like state, broader search, cursor pagination, and a Blog overview projection for featured/hot/recommended posts, authors, stats, and recent comments. A guarded local-only seed adds 16 visibly marked `DEVELOPMENT_FIXTURE` posts, 20 comments, 5 categories, and 10 tags. Focused Web/Discussion tests 21/21, PostgreSQL integration 3/3, Blog runtime E2E 4/4 across desktop/tablet/mobile, root typecheck, API/Web builds, targeted lint, and diff checks pass. The existing full-history `judge_artifacts` migration replay issue remains unrelated; migration `0033_blog_full_experience` applied successfully by targeted runner. Manual UI acceptance remains PENDING USER; main was not merged. See `Docs/reports/OJPLATFORM_BLOG_FULL_EXPERIENCE_V1_REPORT.md`.

Problem Library Full Experience V1 (2026-09-12): PARTIAL overall. Existing list/search/filter/sort/pagination/tag facets are now completed with authoritative submission and accepted-result aggregates, and PostgreSQL search fields are qualified to preserve combined filtering. A local-only, opt-in fixture script seeds 30 `TEST_FIXTURE` problems across five difficulties and broad tag coverage without creating submissions or touching production paths. Focused Problem/Web tests (18/18), root typecheck, Web build, and local PostgreSQL/API query validation pass. One existing Problem Library UI assertion conflicts with the accepted Hero title; manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_PROBLEM_LIBRARY_FULL_EXPERIENCE_V1_REPORT.md`.

Home Full Experience V1 (2026-09-12): PARTIAL overall. Home recommendation cards now consume authoritative public problem projections instead of static product categories; existing Home, Discussion, and Contest public APIs provide all rendered dynamic data. An explicit local-only development fixture command seeds six problems, five announcements, and four contests with `TEST_FIXTURE` provenance; no migration or production data path changed. Focused Home/Problem tests, root typecheck, API/Web builds, actual disposable-PostgreSQL API responses, and diff check pass. Full managed runtime remains blocked by the existing missing Plugin `main` worktree and historical `0020_judge_artifacts` replay failure; manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_HOME_FULL_EXPERIENCE_V1_REPORT.md`.

Profile UI Completeness V1 (2026-09-11): PARTIAL overall. Profile now has a visibility-filtered, source-free recent-submission projection, capability cards, explicit submission empty/error states, and a centralized development-only visual fixture covering identity/media, metrics, activity, solved problems, favorites, authored problems, teams, and mixed verdicts. No migration, production data, authentication, authorization, or permission behavior changed. Focused Profile tests, root typecheck, and Web build pass; runtime/API qualification and manual UI acceptance remain pending. See `Docs/reports/OJPLATFORM_PROFILE_UI_COMPLETENESS_V1_REPORT.md`.

Team Portal Reference UI V1 (2026-09-10): PARTIAL overall, with front-end implementation and automated code scope complete. `/teams` now uses the supplied full-width mountain portal composition, adapted to Team semantics with functional real-data Team views, search, de-duplicated cards, pagination, detail navigation, a current-month creation-activity calendar, and a real-data recommendation rail. Future category, calendar-navigation, and tag controls are explicitly UI-only. Team detail/create flows and all backend/API/database contracts remain unchanged. Root typecheck, Web build, changed-file lint, focused Team/Blog/Problem Detail regression 16/16, and diff check pass. Runtime/browser visual acceptance remains PENDING USER by explicit request. See `Docs/reports/OJPLATFORM_TEAM_PORTAL_REFERENCE_UI_V1_REPORT.md`.

Blog Reference UI V1 (2026-09-10): PARTIAL overall, with front-end implementation and automated code scope complete. The `/discussion` landing page is now an `AlgoOJ 博客` three-column editorial experience, while `/discussion/:id` now uses the supplied solution-style reading layout for solutions, discussions, and announcements. The detail template includes a mountain hero, real author/interaction data, numbered Markdown sections, summary preview, and compact real-comment rail; only solution-marked articles show the UI-only problem-link preview. Existing Discussion API/routes remain unchanged, unsupported controls are explicitly UI-only, and no backend or fabricated business counts were added. Root typecheck, Web build, changed-file lint, focused formatting, focused Blog/global-nav/Problem Detail regression 16/16, and diff check pass. Runtime/browser visual acceptance remains PENDING USER by explicit request. See `Docs/reports/OJPLATFORM_BLOG_REFERENCE_UI_V1_REPORT.md`.

Problem Detail Reference UI V1 (2026-09-10): PARTIAL overall, with implementation and automated scope complete. The Problem Detail page now presents real submission/acceptance/difficulty metrics, consistent SVG icons, deterministic in-workspace breadcrumbs, a real Discussion API-backed secondary tab, and server-filtered related problems. Dedicated tests 2/2, focused existing Problem Detail/breadcrumb regression 18/18, root typecheck, changed-file lint, Web build, and diff check pass. No business data is fabricated and no backend/public contract changed. Runtime Manager startup/shutdown passed; manual browser visual acceptance remains PENDING USER by explicit request. See `Docs/reports/OJPLATFORM_PROBLEM_DETAIL_REFERENCE_UI_V1_REPORT.md`.

Problem Library Full Backend Support V1 (2026-09-10): PASS for automated
feature scope in independent worktree `codex/problem-library-full-backend-support-v1`.
The list now has server-side whitelisted sorting and authoritative
difficulty/source/tag facets using the same visibility-aware predicate as the
filtered list. Search, filters, sorting, pagination, and URL state are
contract-tested; unsupported time/memory/acceptance/personal-state controls are
explicitly disabled or shown as `—`, never fabricated. Focused Problem/Web tests
(19/19), typecheck, changed-file lint, API/Web builds, and diff check pass.
No migration was needed; PostgreSQL runtime qualification and manual UI
acceptance remain NOT VERIFIED/PENDING USER. Canonical main was not modified.
See `Docs/reports/OJPLATFORM_PROBLEM_LIBRARY_FULL_BACKEND_SUPPORT_V1_REPORT.md`.

Problem Library Real Backend Data & Server-side Filtering V1 (2026-09-10): PASS for implementation and automated scope on feature branch `codex/problem-library-server-filter-v1`. Difficulty, canonical tag ID, and canonical source-type filters are validated server-side, compose with search, use the same PostgreSQL predicate for rows and filtered totals, and replace all current-page Problem Library business filtering. URL state restores canonical filters and resets pagination on change. No migration was needed; real PostgreSQL/runtime/manual UI remain NOT VERIFIED/PENDING USER. See `Docs/reports/OJPLATFORM_PROBLEM_LIBRARY_REAL_BACKEND_FILTERING_V1_REPORT.md`.

Home + Problem Library UI Main Integration V1 (2026-09-10): PASS for automated integration scope. Canonical-main UI working changes were captured safely, static production Problem Library sample rows were removed, and the new Home/Problem Library UI remains bound to existing real API contracts. Home announcements, contests, daily problem, routing, query search, current-page difficulty/tag/source filtering, real offset pagination, and sticky pagination are preserved. Typecheck, Web build, focused Home/Problem tests, changed-file lint, and diff checks pass. Manual UI acceptance remains PENDING USER; no browser automation or runtime startup was used. See `Docs/reports/OJPLATFORM_HOME_PROBLEM_LIBRARY_UI_MAIN_INTEGRATION_REPORT.md`.

Product Experience Wave 4F Profile Media & Save Experience V2 Main Integration (2026-09-09): PASS for implementation and automated integration scope. Profile PATCH no longer sends read-only `username`; field validation, optional clearing, upsert, authenticated multipart avatar/background storage, controlled public delivery, replacement/removal, and responsive Profile/Edit Profile UI are integrated. TEMP migration was finalized as unique `0031_profile_media_save_v2`; migration runner registration, root/API/Web typechecks, focused Profile/Web tests, changed-file lint, architecture, and diff checks pass. PostgreSQL/MinIO runtime qualification remains environment-dependent; manual visual acceptance is PENDING USER. See `Docs/reports/OJPLATFORM_WAVE4_PROFILE_MEDIA_SAVE_EXPERIENCE_V2_MAIN_INTEGRATION_REPORT.md`.

Product Experience Wave 4D Discussion & Announcement Experience V4 Main Integration (2026-09-09): PASS for automated, current-state PostgreSQL, capability, and regression scope. Fresh candidate from canonical main integrated feature commit `2f017a8`; migration `0030_discussion_announcement_capability` is unique, applies idempotently, and grants announcement capability only to `platform-root` and `superadmin`. Real transaction fixtures allow root/superadmin announcement create/publish, deny ordinary users, and cleanly roll back. Focused Wave4D/Wave4A/Wave4C/Wave4E regression 91/91, root/API typecheck, API/Web builds, changed-file lint, architecture, and diff checks pass. Manual UI acceptance remains PENDING USER. Full historical migration replay retains the pre-existing `0020 judge_artifacts` blocker. See `Docs/reports/OJPLATFORM_WAVE4_DISCUSSION_ANNOUNCEMENT_EXPERIENCE_V4_MAIN_INTEGRATION_REPORT.md`.

Product Experience Wave 4C Problem Presentation UX V2 Main Integration (2026-09-09): PASS for automated integration scope. Canonical Problem Detail/Create/Edit order, unified content surface, grouped responsive samples, single hints rendering, and shared sanitized Markdown renderer are formally integrated. No schema or migration change; JudgeData preserved. Manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_WAVE4_PROBLEM_PRESENTATION_UX_V2_MAIN_INTEGRATION_REPORT.md`.

Product Experience Wave 4E Team/Homework/Join Request V2 Main Integration (2026-09-09): PASS for automated and real-DB integration scope; manual UI remains pending user. Candidate passed focused 18/18 tests, typecheck, builds, lint, architecture, diff checks, Windows TCP/Node DB connectivity, and clean Team/Join/Homework fixture qualification. Full migration replay still hits pre-existing non-idempotent `judge_artifacts`; no Wave4E migration added. See `Docs/reports/OJPLATFORM_WAVE4_TEAM_HOMEWORK_JOIN_REQUEST_V2_MAIN_INTEGRATION_REPORT.md`.

Product Experience Wave 4A Login Credential UX V2 Main Integration (2026-09-09): PASS. Normal Web password login omits legacy `rememberMe` from request payload; server backward compatibility remains. Main merge `44462e7ff7a18783d9a4f4fb46b0dc321d0132bd` preserves logout revocation, cookie clearing, CSRF, session security, stable autofill fields, password visibility, and password-storage prohibition. Canonical main focused rich-login/auth tests pass 66/66; API/Web builds, root typecheck, changed-file lint, architecture, and diff checks pass. One auth V2 phone fixture failure reproduces on pre-integration main and remains a known baseline. Runtime and manual Password Manager acceptance remain pending user. See `Docs/reports/OJPLATFORM_WAVE4_LOGIN_CREDENTIAL_UX_V2_MAIN_INTEGRATION_REPORT.md`.

Product Experience Wave 4A Login Credential UX V2 (2026-09-09): PASS for the
implemented Web credential UX and focused rich-login regression (61/61).
`记住登录信息` now expresses browser Password Manager intent only; Web no
longer sends legacy `rememberMe`, while server backward compatibility remains.
Stable username/password names and `autocomplete="username"` /
`autocomplete="current-password"`, password visibility control, helper copy,
focus/autofill styling, password-mode-only checkbox, and existing logout/session
security contracts are preserved. No password is stored by the app and no
schema migration is needed. Typecheck, builds, lint, architecture, broader
regression, and manual Password Manager acceptance remain NOT VERIFIED/PENDING
USER. Root typecheck/build and architecture checks pass; changed-file ESLint
passes (CSS ignored by config), while broader regression and manual Password
Manager acceptance remain pending. See
`Docs/reports/OJPLATFORM_WAVE4_LOGIN_CREDENTIAL_UX_V2_REPORT.md`.
 Product Experience Wave 4E Team/Homework/Join Request V2 (2026-09-09): PASS for implemented and automated scope. Fixed Team Assignment response-shape crash, added global Homework navigation, idempotent pending join CTA state, and owner/manager request review list/actions using existing `TeamJoinRequest`. Focused Team/Assignment/Web tests 18/18, typecheck, API/Web builds, changed-file lint, architecture, and diff checks pass. PostgreSQL, runtime, and manual UI remain pending user. See `Docs/reports/OJPLATFORM_WAVE4_TEAM_HOMEWORK_JOIN_REQUEST_V2_REPORT.md`.
 Problem Presentation UX Wave 4C (2026-09-09): PASS for focused implementation and automated checks. Shared Problem statement renderer now owns canonical description/input/output/samples/data-range/notes order; Detail samples sit inside the main content surface; Create/Edit authoring order and grouped sample editing are aligned. No schema or migration change; JudgeData untouched. Focused Web tests 26/26, root typecheck, and diff check pass. Manual UI acceptance remains PENDING USER. See `Docs/reports/OJPLATFORM_WAVE4_PROBLEM_PRESENTATION_UX_V2_REPORT.md`.
Discussion Experience Wave 3C Main Integration V1 (2026-09-09): PASS for required integration scope. Product PostgreSQL Windows connectivity recovered; current-state `0028_discussion_comment_likes` forward/schema/second-run qualification passed, and real PostgreSQL reply/like fixture passed with rollback. Full historical replay remains blocked by pre-existing non-idempotent `0020 judge_artifacts`; runtime smoke remains `BLOCKED_BY_EXISTING_PLUGIN_RUNTIME`. See `Docs/reports/OJPLATFORM_DISCUSSION_EXPERIENCE_WAVE3_MAIN_INTEGRATION_REPORT.md`.

# Auth Remember Me Wave 3 Main Integration V1 (2026-09-09): PASS for implementation and automated integration scope. Fresh candidate from live `main` (`2749d13`) integrated Worker A (`09c4a85`) with no conflicts, preserving Worker E sticky pagination and Worker D Team/Profile correctness. Login contracts now support optional `rememberMe`; normal sessions retain finite 7-day server TTL with browser-session cookies, remembered sessions use finite 30-day configured TTL with matching persistent cookies. Opaque server sessions, `oj_session`, CSRF, `/api/auth/me`, logout, revocation, password-change revocation, invalid-login behavior, and no-Web-Storage credential policy remain intact. Accessible unchecked `记住我` UI is present only for password login. Focused UI/Team/Profile/pagination regression 74/74, API/Web/root typechecks, API/Web builds, changed-file lint, architecture, and diff checks pass. Auth selection is 22/23 because the pre-existing phone verified registration/password-login baseline still returns 400 instead of 200. Runtime HTTP smoke and manual UI remain not verified. See `Docs/reports/OJPLATFORM_AUTH_REMEMBER_ME_WAVE3_MAIN_INTEGRATION_REPORT.md`.

# Team + Profile Correctness Wave 3 Main Integration (2026-09-09): PASS for implemented and automated scope. Worker D was cherry-picked from `1e720704c3e562e36ebaa37810a388006c07599a` onto live main `73d96a3f2af0f48264929e8f02ec99eeaf36570a` in a fresh candidate with no conflicts, preserving Worker E sticky pagination. Public Team detail is decoupled from protected member loading; canonical slug routes and visibility policy remain intact. Profile `/profile` -> `/settings` -> `ProfileEditor` wiring, hydration/save/cancel, inline validation, and global toast are preserved, with obsolete unavailable-editing copy removed. Focused Web 42/42 and Team core 9/9, typechecks, builds, lint, architecture, and diff checks pass. No schema or migration change. PostgreSQL/runtime/manual UI were not run; manual UI remains PENDING USER. See `Docs/reports/OJPLATFORM_TEAM_PROFILE_CORRECTNESS_WAVE3_MAIN_INTEGRATION_REPORT.md`.

Problem Library Sticky Pagination Wave 3E Main Integration (2026-09-08): PASS. Worker E from `codex/problem-pagination-wave3` (`d6df503`) was semantically integrated from the live `refs/heads/main` and merged as `262068b`. Existing offset/page URL and backend contracts remain unchanged; sticky pagination is scoped to Problem Library with loading, duplicate-navigation, stale-response, accessibility, and responsive protections preserved. Main-side focused Web regression 4/4, Web typecheck/build, changed-file lint, architecture, and diff checks pass. Manual UI acceptance remains PENDING USER; no runtime/browser control was performed. See `Docs/reports/OJPLATFORM_PROBLEM_LIBRARY_STICKY_PAGINATION_WAVE3_MAIN_INTEGRATION_REPORT.md`.
Discussion Experience Wave 3C (2026-09-08): PARTIAL. Isolated worker added the
Discussion feed/detail visual polish, reusable threaded comment authoring and
rendering, server-validated comment replies, persistent comment likes, and
canonical home announcement links. Focused Discussion tests, root/API/Web
typechecks, builds, changed-file lint, and diff checks pass. Temporary comment
like migration remains pending final numbering during parallel integration;
PostgreSQL qualification and manual UI acceptance remain pending. See
`Docs/reports/OJPLATFORM_DISCUSSION_EXPERIENCE_WAVE3_REPORT.md`.
Team Assignment & Homework Wave 3F Main Integration V1 (2026-09-09): PASS for candidate implementation, PostgreSQL current-state 0029 qualification, authorization/visibility/membership/progress fixture, and automated quality gates. Full historical replay remains blocked by pre-existing 0020 `judge_artifacts`; runtime smoke is blocked by the existing Plugin Runtime blocker and manual UI remains pending. See `Docs/reports/OJPLATFORM_TEAM_ASSIGNMENT_HOMEWORK_WAVE3_MAIN_INTEGRATION_REPORT.md`.

Profile Experience & Personalization Wave 2 Main Integration V1 (2026-09-08): PARTIAL. Worker D integrated into current main at `b34c2de`; migration renumbered to `0027_profile_experience`, profile/team/privacy APIs and UI preserved. Focused profile plus baseline regression 32/32, typecheck/build, architecture, and diff checks pass. Real schema apply and idempotent second run pass against local PostgreSQL; full migration runner remains blocked by pre-existing historical replay failure at `judge_artifacts`. Manual UI acceptance pending user. See `Docs/reports/OJPLATFORM_PROFILE_EXPERIENCE_WAVE2_MAIN_INTEGRATION_V1_REPORT.md`.

Product Correctness Wave 2 Main Integration V1 (2026-09-08): PARTIAL. Fresh
candidate based on canonical main `52b9dc9744f30c05b1f8ccbc18bee4efe5c75bee`
integrated Feature A at `5fde1fa` with no conflicts, preserving Runtime
Recovery and Worker B authoring. Focused Wave 2 plus authoring/auth regressions
passed (40 tests), root/API/Web typechecks and builds, changed-file lint,
architecture, and diff checks passed. Runtime Manager then started Product
PostgreSQL and applied `0026` exactly once; read-only role check confirms
persisted `platform-root` includes `submission:view:any`. Product HTTP smoke
passed; real admin source matrix and `/api/auth/me` session projection remain
NOT VERIFIED. See
`Docs/reports/OJPLATFORM_PRODUCT_CORRECTNESS_WAVE2_MAIN_INTEGRATION_V1_REPORT.md`.

Product Correctness Wave 2 - Discussion Publish and Admin Submission Source
(2026-09-08): PASS for implementation and isolated qualification. Discussion
post lookup now chooses UUID `id` or text `public_id` predicates instead of
binding one PostgreSQL parameter to both types. A temporary forward migration
grants the existing `platform-root` role canonical `submission:view:any`, and a
dedicated authorized source endpoint now supplies the Evaluation Web Code tab.
Focused tests, transaction-rolled-back PostgreSQL qualification, typechecks,
builds, changed-file lint, architecture, and diff checks pass. Managed runtime
and manual browser smoke remain not verified; Runtime Manager and Judge were not
changed. See
`Docs/reports/OJPLATFORM_PRODUCT_CORRECTNESS_WAVE2_DISCUSSION_ADMIN_SOURCE_REPORT.md`.

Profile Experience & Personalization Wave 2 (2026-09-08): PARTIAL. Added bounded
public profile metadata, own-profile API, Team Core-backed profile projections
with private-team filtering, redesigned profile presentation, and grouped
profile editor. Focused profile tests and API/Web typechecks pass; isolated
PostgreSQL migration qualification and manual UI acceptance remain pending.
 See `Docs/reports/OJPLATFORM_PROFILE_EXPERIENCE_PERSONALIZATION_WAVE2_REPORT.md`.

Runtime Stop Ownership Recovery Finalization V1 (2026-09-08): PARTIAL. Runtime
Stop repair is formally persisted on main in `c0010a0c741ae4038e4e1db4e29fcee473ee24b5`.
Committed-state ownership, orphan recovery, manual recovery, launcher, parser,
and diff checks pass. Prior real 3180 orphan recovery remains qualified. A new
real lifecycle attempt was blocked by existing Judge Worker binary locks and an
unauthorized Judge admin probe; Runtime Manager correctly failed closed, and no
Judge code or process was changed manually. See
`Docs/reports/OJPLATFORM_RUNTIME_STOP_OWNERSHIP_RECOVERY_FINALIZE_V1_REPORT.md`
and `Docs/reports/OJPLATFORM_RUNTIME_STOP_OWNERSHIP_RECOVERY_REPAIR_V1_REPORT.md`.

Product UX Repair Wave 1 - Tags / Team / Discussion Navigation (2026-09-08):
PASS for implementation, automated validation, and runtime qualification.
Problem authoring now uses one compact, searchable TagSelector popover for
create/edit. Team list duplication was traced to Web concatenation of
membership and public query results; those result sets now have separate views,
with public results excluding current memberships and ID-safe pagination.
Team list, detail, empty, and create surfaces were redesigned, including
validation, live preview, responsive layouts, and synchronous double-submit
protection. Discussion Core, found absent from current main despite the task
premise, was integrated from its existing qualified branch with migration
renumbered to `0025`, and the Chinese primary navigation now links to
`/discussion` with nested-route active state. Focused tests 48/48 and selected
regression tests 69/69 pass; API/Web typechecks and builds, changed-file lint,
architecture, and diff checks pass. Runtime created exactly one Team row and one
OWNER membership from one POST; each API list contained it once, and the fixture
was removed. Full lint retains the known 8 unrelated baseline errors. Manual UI
acceptance remains PENDING USER. See
`Docs/reports/OJPLATFORM_PRODUCT_UX_REPAIR_WAVE1_REPORT.md`.

Main Integration Wave 2 - Team Core V1 (2026-09-07): PASS for conservative
integration and local PostgreSQL qualification. Candidate was based on current
main `8d0353f6b51618a46a6a7d4e44458fed90af0898` and merged the complete
`codex/team-core-v1` history. Team migration `0023_team_core_v1` applied through
the product runtime ledger; focused Team/API/Web tests, PostgreSQL repository
smoke, typechecks, builds, targeted lint, architecture, and diff checks pass.
Manual UI acceptance remains PENDING USER. See
`Docs/reports/OJPLATFORM_MAIN_INTEGRATION_WAVE2_TEAM_CORE_V1_REPORT.md`.

Team Core V1 Completion (2026-09-07): PARTIAL for runtime qualification. Team
schema/migration, repository transactions and locks, API integration, audit
hook wiring, dedicated member counts, cursor consistency, authorization, and
concurrency regressions are implemented. Focused Team/API/Web tests (25), API
and Web builds, typecheck, targeted lint, architecture, and diff checks pass.
PostgreSQL migration apply is NOT VERIFIED because local `127.0.0.1:55432` is
unavailable; manual UI acceptance remains PENDING USER. Ownership transfer,
archive/delete, content collections, assignments, discussion, analytics, and
tags remain deferred. See
`reports/OJPLATFORM_TEAM_CORE_V1_REPORT.md`.
Canonical Main Launcher Finalize & Integration V1 (2026-09-07): PASS. Main
is on `8d0353f6b51618a46a6a7d4e44458fed90af0898`, including the committed
canonical launcher repair `6c10b841ce377ece6090214a2d34616a3861a27e`. The
canonical root is `D:\OJPlatform` on branch `main`; Status and a real
`OJPlatform-Start.bat` smoke both report the same root/branch/HEAD, with
`SOURCE MATCH = YES`, `VERSION MATCH = YES`, and `MIXED SOURCE = False`.
User dirty and untracked content was preserved; no clean, hard reset, or
stash was used. See
`Docs/reports/OJPLATFORM_CANONICAL_MAIN_LAUNCHER_FINALIZE_INTEGRATION_V1_REPORT.md`.

Main Integration Wave 1 Launcher + Maintenance (2026-09-07): PASS. Main
was updated normally from candidate `codex/main-integration-wave1` at
`8d0353f6b51618a46a6a7d4e44458fed90af0898`, integrating canonical launcher
repair plus generated-fixture maintenance. Launcher focused test, PowerShell
syntax validation, cleanup script syntax, 31 focused tests, canonical status,
and operational start smoke passed. Read-only DB verification confirmed 44
total / 40 active / four tombstoned. User dirty status and
untracked artifacts were preserved. See
`Docs/reports/OJPLATFORM_MAIN_INTEGRATION_WAVE1_LAUNCHER_MAINTENANCE_REPORT.md`.

Canonical Main Launcher Repair V1 (2026-09-07): IMPLEMENTED. Runtime Manager
now treats `D:\OJPlatform` as authoritative canonical source, verifies local
`refs/heads/main`, reports canonical identity while runtime is down, and fails
closed when the canonical checkout is not on `main`. Default resolution no
longer scans registered worktrees. Focused canonical-source tests and
PowerShell runtime smoke passed; full runtime start was not run because current
checkout is a feature branch and must not be switched automatically. See
`Docs/reports/OJPLATFORM_CANONICAL_MAIN_LAUNCHER_REPAIR_V1_REPORT.md`.

Problem Data & Tags Read-Only Audit V1 (2026-09-06): PARTIAL. Current tags
use PostgreSQL `tags` + `problem_tags` relations but expose free-form
`string[]`; catalog fields and API are not yet normalized. Read-only local DB
inventory found 4 definitely generated SQL fixtures, 40 UNKNOWN, and no
definitely manual rows. Hard-delete recommendation is 0; soft-delete design
proposal is ready. No product code or DB data changed. See
`Docs/reports/OJPLATFORM_PROBLEM_DATA_TAGS_READ_ONLY_AUDIT_V1_REPORT.md`.

Core Fix Wave 1 Conservative Integration V1 (2026-09-06): PASS for the
conservative code/docs integration gate. Canonical main base
`6719304fb436e1699e8b4a64dc8e82b97828be45` had no drift. Source A and B were
normal-merged in order; the four named read-only audit documents were added in
an isolated docs commit. Combined critical regression (`206/206`), typecheck,
build, architecture, changed-file lint, and diff checks pass. One existing
`app.ts` lint error is reproduced on latest main and is recorded as
PRE-EXISTING BASELINE. Manual UI acceptance remains PENDING USER. See
`reports/OJPLATFORM_CORE_FIX_WAVE1_CONSERVATIVE_INTEGRATION_V1_REPORT.md`.

Core Submission & Admin Source Repair V1 (2026-09-06): PARTIAL. Branch
`codex/core-submission-admin-source-v1` starts at main
`6719304fb436e1699e8b4a64dc8e82b97828be45`. Session-derived
`canViewAnySubmission` now reaches Submission/Evaluation authorization and the
real Product detail endpoint; owner/admin/other/anonymous endpoint matrix and
real `buildApp` session-chain test pass. JudgeData draft cloning now rebinds to
current Problem revision while preserving immutable published versions. Online
Editor Submit delegates to formal Product Submission service and preserves
business errors. Focused tests, typecheck, Web/API builds, targeted lint,
architecture, formatting, and diff checks pass. Full repository tests/lint and
one existing database composition assertion retain unrelated failures; browser
acceptance remains pending user verification. See
`reports/OJPLATFORM_CORE_SUBMISSION_ADMIN_SOURCE_REPAIR_V1_REPORT.md`.

Problem Authoring Layout Repair V1 (2026-09-06): PASS for implemented and
focused-tested scope. Create/Edit authoring routes now use an authoring-only
`80vw` desktop workspace capped at `1560px` with `96vw` narrow-screen sizing.
JudgeData testcase cards use normal document flow with independent Input and
Expected Output controls, responsive desktop/two-column and narrow/one-column
layouts, and bounded textarea overflow. Focused ProblemEditor tests (22/22),
Web typecheck, Web build, targeted ESLint, and diff check pass. Manual browser
acceptance remains PENDING USER by task policy; no main merge was performed.
See `reports/OJPLATFORM_PROBLEM_AUTHORING_LAYOUT_REPAIR_V1_REPORT.md`.

Browser-Verified Repair V2 Final Acceptance (2026-09-06): PARTIAL. Candidate
`codex/browser-verified-repair-v2-integration` ran with `MIXED SOURCE = False`
and healthy Web/API/PostgreSQL. Live Profile heatmap tooltip and existing
Evaluation testcase cards were observed. Admin cross-owner source, Create UI,
published Problem persistence, and JudgeData editor were not fully browser
verified; main merge is not allowed. See
`reports/OJPLATFORM_BROWSER_VERIFIED_REPAIR_V2_FINAL_ACCEPTANCE_REPORT.md`.

Browser-Verified Product Repair Wave V2 (2026-09-06): PARTIAL. Integration
candidate `codex/browser-verified-repair-v2-integration` contains Admin Source,
shared Problem Authoring/published save, Heatmap tooltip, JudgeData editor flow,
and Evaluation testcase card repairs. Focused tests (35), Web/API typechecks,
Web/API builds, and diff check pass. Real Runtime/browser acceptance was not
verified, so Issues 1/4/5/6 are not full PASS and candidate is not merged to
main. See `reports/OJPLATFORM_BROWSER_VERIFIED_PRODUCT_REPAIR_WAVE_V2_REPORT.md`.

Final Release Gate & Main Merge V1 (2026-09-06): PARTIAL. Candidate
`codex/conservative-product-ux-final-integration-v1` is at `a80fe32`; canonical
main started at `7b812a8` and drift was recorded. Focused candidate checks pass
(`255/255`), typecheck/build/diff check pass. Formal Runtime Manager recovery
restored PostgreSQL/Redis/MinIO but left API/Judge owned by another checkout,
Web/Host Agent down, Worker stale, and `MIXED SOURCE = True`; browser and real
Run/Submit remain NOT VERIFIED. Main merge was intentionally not performed.
See `reports/OJPLATFORM_FINAL_RELEASE_GATE_MAIN_MERGE_V1_REPORT.md`.

Online Code Editor Visibility & Integration V1: PARTIAL. Product `ProblemDetail`
now mounts canonical Plugin `ojplatform.online-code-editor` at
`problem.solve.editor` after statement/samples, with Run/Submit adapters and
visible plugin failure fallback. Plugin tests/typecheck/build and Product
focused tests/Web typecheck/build pass. Runtime browser verification is blocked
by existing worker `HOST_CAPACITY_EXHAUSTED` recovery failure; full Product
suite retains unrelated existing failures. See
`reports/OJPLATFORM_ONLINE_CODE_EDITOR_VISIBILITY_INTEGRATION_V1_REPORT.md`.

Full Product State Diagnosis & Recovery V1: PARTIAL. Recovered merge-lost
evaluation navigation, capability-driven problem editing, sample presentation,
breadcrumb/admin navigation, and authenticated evaluation-list protection.
Focused Web/Product/Auth checks pass (383 tests), and Runtime Manager restart with
doctor now proves canonical product/plugin `main` sources with
matching Runtime Manager source identity and `MIXED SOURCE = False`.
Browser guest evaluation-list smoke passes; persisted
root credential and root/admin browser workflows remain NOT VERIFIED because no
credential was changed. See
`reports/OJPLATFORM_FULL_PRODUCT_STATE_DIAGNOSIS_RECOVERY_V1_REPORT.md`.

Conservative ABC Integration V1: PARTIAL. Independent branch
`codex/conservative-abc-integration-v1` starts from main `7b812a8` and merges
Problem List Compact V3, Problem Authoring V3, and Evaluation Detail UX V5 in
that order. Targeted ABC plus baseline checks pass (285 tests); six existing
base-main failures remain reproduced, full lint has existing out-of-scope
errors, and browser smoke is not verified. Branch is an ABC candidate for D;
it is not merged to main. See
`reports/OJPLATFORM_CONSERVATIVE_ABC_INTEGRATION_V1_REPORT.md`.

Post-Merge UI Regression Recovery V1: PARTIAL. Restored pre-wave global
Evaluation List filters/layout and breadcrumb de-duplication while preserving
Evaluation UX V4 and Admin permission-gated navigation. Build, focused tests,
and browser smoke are blocked in the dependency-free recovery worktree. See
`reports/OJPLATFORM_POST_MERGE_UI_REGRESSION_RECOVERY_V1_REPORT.md`.

## Root Submission Source Access V1

PASS on branch `codex/root-submission-source-access-v1`. Submission detail
authorization now uses canonical `submission:view:any` permission resolver
for highest-admin cross-owner source access, while owner-only and anonymous /
ordinary-user denial remain enforced. Global evaluation list and SSE paths do
not expose source. Focused authorization tests, typecheck, build, and diff
check pass; browser runtime was not run.

Submission Direct Evaluation V2: PASS. Traditional submit now navigates directly
to existing Submission/Evaluation Detail after create success; accepted
intermediate state removed, duplicate submit guarded, and API errors remain on
form. Focused Web tests, typecheck, and build pass. Browser smoke not verified.
See `reports/OJPLATFORM_SUBMISSION_DIRECT_EVALUATION_V2_REPORT.md`.

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

Evaluation UX V4: PARTIAL. Evaluation Detail progress, code, testcase grid, information card, and 3-second terminal-aware reconciliation are implemented. Browser runtime not verified; one legacy focused assertion expects removed/changed testcase presentation. See `OJPLATFORM_EVALUATION_UX_V4_REPORT.md`.

Problem List Compact UX V2: PASS for focused Web scope. Problem rows are denser,
IDs are emphasized, tags stay horizontal with responsive wrapping, and ordinary
item source text is removed. Focused tests, typecheck, and Web build pass; runtime
smoke was not run. See `OJPLATFORM_PROBLEM_LIST_COMPACT_UX_V2_REPORT.md`.

PROFILE SOLVING HEATMAP V1: IMPLEMENTED and focused-tested; browser runtime not verified. See `OJPLATFORM_PROFILE_SOLVING_HEATMAP_V1_REPORT.md`.

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

Last Updated: 2026-09-06

Team Core V1 (2026-09-06): PARTIAL. Branch `codex/team-core-v1` starts from
`f9da2e1ab2c48842f07d457d55f614efa8fb70b6`. Team schema, repository/service,
backend authorization, open/request/invite-only membership, invitations, join
requests, hashed invite codes, basic Web routes, and stable Team contract are
implemented. Team service tests (3/3), repository-wide TypeScript typecheck,
and Web build pass. PostgreSQL migration/API integration, full lint,
architecture, runtime, and manual UI acceptance are not verified. See
`Docs/reports/OJPLATFORM_TEAM_CORE_V1_REPORT.md`.

Evaluation Detail UX V5 (2026-09-06): PASS for implemented/static Web scope.
Result/code tabs, source copy feedback, right-side evaluation metadata,
Generation History removal, Problem link, bounded testcase cards, SSE and
3-second terminal-aware refresh are implemented. Focused V5 tests, Web
typecheck/build, targeted lint, formatting, and diff checks pass. Browser and
managed-runtime qualification were not run. See
`reports/OJPLATFORM_EVALUATION_DETAIL_UX_V5_REPORT.md`.

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

Product UX Wave Integration V1 (2026-09-05): PASS. Integration branch
`codex/product-ux-wave-integration-v1` merges Evaluation UX V4, direct
submission detail, root submission source authorization, Problem List compact,
Problem Statement renderer/preview, and profile heatmap. Web typecheck/build
and diff check pass; 47 focused tests pass, including 3-second snapshot
reconciliation, terminal stop, unmount cleanup, SSE retention, and stale-state
protection. See `Docs/reports/OJPLATFORM_PRODUCT_UX_WAVE_INTEGRATION_V1_REPORT.md`.

Conservative Product UX Final Integration V1 (2026-09-06): PARTIAL. ABC
candidate `6c4d14a` and Online Code Editor D `70a5679` were merged normally into
`codex/conservative-product-ux-final-integration-v1` at `98c6126` with audited
App/app.css conflict hunks. Problem Detail preserves renderer, samples, aside,
permissions, and adds the `problem.solve.editor` host with Run/Submit adapters,
checker injection, fallback, and diagnostics. Product targeted tests (`216/216`),
plugin tests (`31/31`), Web typecheck/build, lint, and diff check pass. Full
suite failures reproduce on base main; Postgres integration is environment
blocked. Runtime/browser and real Run/Submit remain NOT VERIFIED because of
known `HOST_CAPACITY_EXHAUSTED`. Main merge intentionally stopped. See
`Docs/reports/OJPLATFORM_CONSERVATIVE_PRODUCT_UX_FINAL_INTEGRATION_V1_REPORT.md`.

Final Main Alignment & Safe Merge V1 (2026-09-06): PASS. Latest canonical
`main` was `7b812a8`; candidate `codex/conservative-product-ux-final-integration-v1`
was `2adba6e`, with merge-base equal to latest `main` (no main drift). A fresh
`codex/final-main-alignment-v1` worktree merged the candidate normally with no
conflicts. Focused regression tests passed (`409/409` across both targeted
runs), Web typecheck/build and diff check passed. Candidate-touched lint is
clean; the remaining nine full-lint errors reproduce on pristine `main` and
are recorded as historical baseline failures. Runtime was DOWN/CLEAN; no
runtime repair or browser qualification was attempted. User dirty
`scripts/dev-runtime.ps1` and untracked artifacts were preserved. See
`Docs/reports/OJPLATFORM_FINAL_MAIN_ALIGNMENT_SAFE_MERGE_V1_REPORT.md`.

Conservative Fix Wave Integration V1 (2026-09-06): PASS for automated code
integration. Problem Edit Save, Admin Source Access, Profile Heatmap, and
Evaluation Testcase Card were merged in order from the real `main` baseline
without conflicts. Focused tests (16/16), regression subset (228/228), Web/API
type/build checks, and diff check pass. Full lint has nine pre-existing errors
that reproduce on pristine `main`. Real PostgreSQL save and browser/runtime
smoke were not verified. See
`Docs/reports/OJPLATFORM_CONSERVATIVE_FIX_WAVE_INTEGRATION_V1_REPORT.md`.

Final Code-Only Safe Merge V1 (2026-09-06): PASS for code-only integration.
Candidate `codex/browser-verified-repair-v2-integration` was based on current
`main` with no drift and merged normally into
`codex/final-code-only-safe-merge-v1`. Six requested repairs are present.
Focused feature tests `52/52`, critical regression tests `135/135`, Web/API
typecheck/build, changed-feature-path lint, and diff check pass. One existing
`apps/api/src/app.ts` lint finding and unrelated full-suite failures reproduce
on pristine `main`. A published-save revision-pointer regression found during
audit was fixed and covered; DB/API runtime was unavailable. Main merge and
post-merge checks are recorded in
`Docs/reports/OJPLATFORM_FINAL_CODE_ONLY_SAFE_MERGE_V1_REPORT.md`.
Main Integration Wave 3 Problem Tags V1 (2026-09-07): PARTIAL. Fresh candidate
integrated Problem Tag Catalog & Metadata V1 on current main, renumbering the
source `0023_problem_tag_catalog` migration to `0024_problem_tag_catalog` while
preserving Team Core `0023`. Product PostgreSQL migration and idempotent seed
qualified: 81 tags across 10 categories, second seed count unchanged, duplicate
slugs zero. Real PostgreSQL API fixture passed catalog, create/edit `tagIds`,
unknown/inactive rejection, list, and detail checks; 40 active Problems and 4
tombstones remain, including P0011-P0014. Focused tests 28/28, typechecks,
builds, changed-file lint, architecture, and diff check pass. Full lint retains
8 pre-existing unrelated findings; manual browser acceptance remains pending.
See `Docs/reports/OJPLATFORM_MAIN_INTEGRATION_WAVE3_PROBLEM_TAGS_V1_REPORT.md`.

Discussion Core V1 (2026-09-06): PARTIAL. Discussion domain, API routes,
sanitized Markdown/LaTeX renderer, Web home/detail/editor, migration, focused
tests, typechecks, builds, architecture check, and diff check added on isolated
branch `codex/discussion-core-v1`. PostgreSQL runtime and manual UI acceptance
remain NOT VERIFIED. See
`Docs/reports/OJPLATFORM_DISCUSSION_CORE_V1_REPORT.md`.

Discussion Core V1 closeout (2026-09-07): requested closeout items added:
safe author projection/profile links with deleted-user fallback, shared
Markdown toolbar, comment refresh/edit/delete interaction, and stale navigation
test update. Focused/component tests, typecheck, builds, lint, and diff check
pass. PostgreSQL runtime and manual UI acceptance remain NOT VERIFIED.
Judge Runtime Stale Worker & Admin Auth Recovery V1 (2026-09-08): PASS. Current
main runtime was recovered from a stale Judge Service/token generation and a
verified orphan Worker. Admin active-job query returned authorized 200 with
active jobs 0; wrong token returned 401. Scoped Worker recovery released the
canonical binary lock and reconciled Host Agent state. Two Start/Status/Stop
lifecycle runs passed with `MIXED SOURCE = False`, followed by clean shutdown.
Runtime focused tests, Judge/Host Agent tests, Go Worker tests, typecheck,
build, architecture, parser, and diff checks passed. See
`reports/OJPLATFORM_JUDGE_RUNTIME_STALE_WORKER_ADMIN_AUTH_RECOVERY_V1_REPORT.md`.

Authoring UX Wave 2B (2026-09-08): PARTIAL. Unified authoring toolbar/editor surfaces, global ToastProvider, Problem header/action cleanup, JudgeData card layout, and Article authoring redesign implemented in isolated worktree. Focused tests 42/42, web typecheck/build, architecture check pass. Manual UI acceptance and runtime remain pending. See `Docs/reports/OJPLATFORM_AUTHORING_UX_WAVE2_REPORT.md`.

Authoring UX Wave 2B Main Integration V1 (2026-09-08): PASS for semantic
integration and automated validation. Feature commit `f4397550` was integrated
on current main without whole-file conflict resolution. Focused suite 42/42,
Web/API/root typechecks, Web/API builds, changed-file lint, architecture, and
diff checks pass. One unrelated Profile baseline test failure reproduces on
pre-integration main. Manual UI acceptance remains PENDING USER; runtime smoke
was not run. See
`Docs/reports/OJPLATFORM_AUTHORING_UX_WAVE2_MAIN_INTEGRATION_V1_REPORT.md`.

Discussion Hub Experience Wave 2 (2026-09-08): IMPLEMENTED and automated Web
scope tested on isolated branch `codex/discussion-hub-wave2`. `/discussion` is
now the unified ARTICLE/ANNOUNCEMENT content hub with URL-backed tabs and title
search, editorial feed rows, compact loading/error/empty states, one shared
content presentation system, reading-focused detail, capability-driven owner
and comment controls, responsive layout, and renderer regression coverage.
Static home announcements remain version-controlled and domain-specific; no
schema or API repository change was needed. Manual UI acceptance remains
PENDING USER. See
`Docs/reports/OJPLATFORM_DISCUSSION_HUB_EXPERIENCE_WAVE2_REPORT.md`.

Discussion Hub Experience Wave 2 Main Integration V1 (2026-09-08): PASS on
candidate branch. Latest-main Worker A correctness and Worker B authoring were
preserved while Worker C Hub, feed, detail, comments, URL filters, responsive
styles, and global Copy Link Toast were integrated semantically. Focused tests
20/20, PostgreSQL correctness 1/1, Web/API/root typechecks, builds, changed-file
lint, architecture, and diff checks pass. One Profile fixture failure reproduces
on pre-integration main and is not a new regression. Manual UI acceptance is
PENDING USER. See
`Docs/reports/OJPLATFORM_DISCUSSION_HUB_WAVE2_MAIN_INTEGRATION_V1_REPORT.md`.
Authoring UX Wave 4C Problem Presentation V2 (2026-09-09): PARTIAL. Detail now uses one content surface with canonical statement/input/output/sample/constraints/notes order; duplicate notes composition removed at render contract; Create/Edit authoring order and grouped sample editing aligned; focused renderer/editor/UI tests 35/35 and root typecheck pass. Manual UI, API/Web builds, changed-file lint, and architecture checks remain pending. See `Docs/reports/OJPLATFORM_WAVE4_PROBLEM_PRESENTATION_UX_V2_REPORT.md`.
Wave4F Profile Media & Save V2: merged to main (2026-09-09), but final qualification remains PARTIAL because real Profile/avatar/background API fixture was not verified. PostgreSQL/MinIO infrastructure and current-state migration 0031 PASS. Next: complete real fixture qualification, then update gate.

Contest Reference UI V1 (2026-09-11): PARTIAL. The supplied competition landing
page was recreated as a frontend-only React experience with the mountain hero,
platform shortcuts, contest cards, filters/search, calendar, upcoming list,
tags, responsive behavior, and dedicated footer. Existing contest API/error/
retry/detail flows remain intact; no backend or dependency changed. Typecheck,
Web build, changed-component lint, focused contest tests, and diff check pass.
Pixel-level browser comparison was explicitly waived by the user and remains
NOT VERIFIED. See `Docs/reports/OJPLATFORM_CONTEST_REFERENCE_UI_V1_REPORT.md`.

Submission Records Reference UI V1 (2026-09-11): PARTIAL. `/submissions` now
uses an isolated feature-owned recreation of the supplied all-records and
personal-records designs: mountain hero, contextual secondary tabs, summary
cards, filters/search, responsive real-data table, cursor pagination, daily
metrics, verdict analysis, and seven-day trend surfaces. Existing evaluation
and profile APIs, secure detail/source navigation, loading/error/empty states,
and authorization boundaries remain intact; no backend changed and unavailable
aggregates display explicit placeholders instead of fabricated data. Typecheck,
Web build, changed-file lint, Web tests 12/12, architecture, and diff checks
pass. Manual visual acceptance remains PENDING USER. See
`Docs/reports/OJPLATFORM_SUBMISSION_RECORDS_REFERENCE_UI_V1_REPORT.md`.

Evaluation / Submission Detail UI Iteration V1 (2026-09-11): PARTIAL. The
submission evaluation detail page is now feature-owned and recreates the
supplied mountain hero, submission summary, live testcase matrix, run/resource
overview, verdict counts, source tab, and SSE event log using existing real
submission/judge/evaluation data. Missing score, ETA, limits, or logs use an
explicit placeholder/empty state; no backend, contract, dependency, or global
architecture changed. Focused detail tests 15/15, Web regression tests 12/12,
typecheck, changed-file lint, Web build, architecture, and diff checks pass.
Manual visual acceptance remains PENDING USER. See
`Docs/reports/OJPLATFORM_EVALUATION_SUBMISSION_DETAIL_UI_ITERATION_V1_REPORT.md`.

Problem Library Screenshot Repair Pass V2 (2026-09-13): PASS for feature implementation and browser verification on branch `codex/problem-library-screenshot-repair-v2`. Real `1448×1086` before/after capture now matches the reference structure more closely: denser 15-row table, working list/grid modes, refined Hero/filter/tag-selector geometry, populated right rail, and responsive no-overflow behavior. Local-only opt-in fixtures provide 30 provenance-marked problems plus 8,535 deterministic demo submission/evaluation rows; production semantics/startup remain unchanged. Focused tests 2/2, typecheck, Web build, and diff check pass. Manual final review remains PENDING USER. See `Docs/reports/PROBLEM_LIBRARY_SCREENSHOT_REPAIR_V2_REPORT.md`.

Problem Library Data Semantics + Visual Fidelity V3 (2026-09-13): PARTIAL pending user visual acceptance and shared-runtime recovery. Independent provider metadata/filtering, compatibility-safe difficulty display mapping, tag-catalog-derived primary categories, stable development-only personal statistics, and a deterministic 70-problem fixture dataset are implemented on `codex/problem-library-data-semantics-v3`. Real PostgreSQL migrations and provider/revision integration passed; focused tests 23/23, PostgreSQL integration 1/1, typecheck, targeted lint, API/Web builds, and diff check pass. In-app browser acceptance passed at 1448, 2048, 768, and 390 widths with no document overflow. Shared Runtime Manager switching remained fail-closed on unknown Judge active-job state; isolated current-branch ports were used without disturbing the shared processes. Main merge was not performed. See `Docs/reports/PROBLEM_LIBRARY_DATA_SEMANTICS_VISUAL_FIDELITY_V3_REPORT.md`.

Problem Library V3 Integration (2026-09-13): PASS. Live main `294f63b` was merged with V3 tip `d638660` through a fresh candidate and normal no-ff merge `065e6bd`; dependency commit `23e1270` and feature commits `c549fe7`/`d638660` retain full history. No conflicts occurred, and scoped feature trees match the validated source exactly. Focused tests 23/23, PostgreSQL integration 1/1, typecheck, targeted lint, API/Web builds, seed syntax, and diff check pass. Existing untracked files, three stashes, and all worktrees were preserved. Manual UI acceptance remains PENDING USER. See `Docs/reports/PROBLEM_LIBRARY_V3_INTEGRATION_REPORT.md`.

Homework Dashboard Recreation (2026-09-14): PASS for implementation, focused testing, browser screenshot comparison, and responsive inspection on `codex/homework-dashboard-recreation`. The isolated `/homework` feature now reproduces the supplied three-column assignment dashboard with page-owned fixture data and SVG mountain artwork; existing assignment detail/team routes remain API-backed. Focused tests 2/2, route regression WEB-V4-025, typecheck, Web build, and diff check pass. Browser audits passed at 1680 × 941, 720 × 960, and 390 × 840 with no horizontal overflow. Main merge was not performed; manual UI acceptance remains PENDING USER. See `Docs/reports/HOMEWORK_DASHBOARD_RECREATION_REPORT.md`.

Docker Phase 6B-1 Judge Service Control Plane V1 (2026-09-18): PASS on feature branch. Added non-root Judge Service/migration images and Compose `judge` profile with explicit bootstrap/migration gates, Judge-only DB credentials, dependency-aware readiness, loopback-only host access, dropped capabilities, read-only rootfs, and no Docker socket or execution-cell containerization. Isolated Windows/WSL2 `linux/amd64` validation passed fresh startup, second no-op migration, migration-failure blocking, API DNS/token connectivity, runtime inspection, Core no-profile regression, and focused tests (52 passed, 5 skipped). No real Submission, user DB, compiler rootfs, cgroup, Supervisor, Host Agent, or Worker was modified. Judge Service arm64 build remains unverified after a machine-local BuildKit TLS timeout. `oj-sandbox` Docker-group membership and shared ACL-less Worker Redis remain HIGH production blockers; production Judge qualification remains NO. Next: Phase 6B-2 host-native Worker Redis isolation. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B1_JUDGE_SERVICE_V1_REPORT.md`.

Docker Phase 6B-1 Judge Service Control Plane Integration V1 (2026-09-18): PASS. Feature commit `fac3f615` was integrated into live main `5a76066b` through integration branch `codex/docker-phase6b1-judge-service-v1-integration-v1` and no-ff merge `8e5e453e`; full feature history was preserved with no conflicts and no whole-file resolution. Merge content is exactly the single 6B-1 commit and touches no Worker, Host Agent, Supervisor, sandbox, runc, cgroup, Redis ACL, or `oj-sandbox` group code. Integration validation passed `git diff --check`, target formatting/lint, TypeScript, focused Judge/migration tests 18/18, secret scan, and rendered Compose checks: Judge profile dependency graph intact, Judge Service runtime security options intact, Judge Service environment limited to Judge DB/Redis/tokens, default Core free of Judge services, and production public ingress still Web only. Handoff compressed to 96 lines. Both HIGH blockers remain OPEN and production Judge qualification remains NO. Next: Phase 6B-2 (host-native Worker Redis isolation) with `GPT-5.6 Sol` + high reasoning. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B1_JUDGE_SERVICE_V1_REPORT.md`.

Docker Phase 6B-2 Execution Cell Integration V1 (2026-09-18): PASS on feature branch. Dockerized Product API/Judge Service and an isolated WSL2 host-native Worker passed Compose-DNS and loopback endpoint separation, node registration/heartbeat, trusted fixture claim/resolve, invalid-token rejection, Judge/API/Redis restart recovery, Supervisor-protocol fail-closed behavior, incarnation replacement/fencing, graceful shutdown, scoped Redis prefix, loopback bind, and cleanup. Worker readiness now requires control plane, Redis, and Supervisor preflight; Judge Service reconnects Redis after restart. No user Submission, untrusted code, runc, real Supervisor, rootfs, cgroup, shared runtime, or user DB was touched. Explicit durable node execution-readiness remains MEDIUM debt. `oj-sandbox` Docker-group membership and ACL-less shared Worker Redis remain HIGH / OPEN; production Judge remains unqualified. Next: Phase 6B-3 Redis ACL/credential isolation. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B2_EXECUTION_CELL_INTEGRATION_V1_REPORT.md`.

Docker Phase 6B-2 Execution Cell Integration V1 Integration (2026-09-18): PASS. Feature commit `9e5e4a85` was integrated into live main `fad79886` through integration branch `codex/docker-phase6b2-execution-cell-integration-v1-integration-v1` and no-ff merge `a19077e6`; full feature history was preserved with no conflicts and no whole-file resolution. Merge content is exactly the single 6B-2 commit and touches no Redis ACL implementation, `oj-sandbox` Docker-group change, Supervisor source, runc/cgroup, rootfs, or Host Agent containerization. Validated: Compose-internal `judge-service:3100` for the API container versus host loopback `127.0.0.1` for the native Worker, development Redis host bridge loopback-only and production Redis unpublished, Supervisor absent from all rendered Compose networks, no Docker socket/privileged/host-network/added capabilities, Judge Service still limited to Judge DB/Redis/tokens, default Core render still free of Judge services, Worker control-plane/Redis/Supervisor readiness fail-closed, and preserved Worker-to-Supervisor `127.0.0.1:19092` contract. Integration validation passed `git diff --check`, targeted Prettier/ESLint, root TypeScript, Judge container contract 6/6, targeted Judge Vitest 79 passed / 5 skipped, architecture gate, Worker `go vet` plus 10-package Go tests, secret scan, and three Compose renders (base/dev/prod). Execution readiness model remains PARTIAL; Supervisor baseline test debt is pre-existing and unchanged. Both HIGH blockers (`oj-sandbox` Docker group, ACL-less shared Worker Redis) remain OPEN and production Judge qualification remains NO. No real user Submission or untrusted code was executed. Next: Phase 6B-3 Redis ACL/credential isolation with `GPT-5.6 Sol` + high reasoning.

Docker Phase 6B-3 Redis ACL / Credential Isolation V1 (2026-09-18): PASS on feature branch. Redis 7.4.1 now uses separate Product, Judge Service, Worker, health, and admin identities with default user disabled, exact command/key/channel scopes, automated idempotent bootstrap, external production credentials, and authenticated Worker URL support. Isolated negative tests denied cross-namespace and administrative access; no/wrong/disabled credentials, revocation plus connection kill, fresh/second startup, Redis restart persistence, Product/Judge recovery, and Worker/Judge fail-closed readiness passed. The Worker Redis ACL HIGH blocker is RESOLVED. `oj-sandbox` Docker-group membership and full sandbox regression remain open; production Judge remains NO. No real Submission or untrusted code executed. Next: Phase 6B-4 privilege hardening. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B3_REDIS_ACL_V1_REPORT.md`.

Docker Phase 6B-3 Redis ACL Integration V1 (2026-09-18): PASS. Feature commit `2adec20ea1bd2dbeb4cd386d6027b8d1fd1c35dd` was integrated through candidate `codex/docker-phase6b3-redis-acl-v1-integration-v1` by no-ff merge `f4d0d0c126b44b103c3f3a2cf03df73df4904fc0`, preserving full history without conflicts. Redis 7.4.1 ACLs retain separate Product, Judge Service, Worker role-level, health, and admin identities; default user lockdown, command/key/channel scopes, cross-identity/admin/wrong-credential denial, repeated bootstrap, restart persistence, fail-closed authentication, production-unpublished and development-loopback exposure all passed integration validation. Worker Redis ACL HIGH blocker is RESOLVED; `oj-sandbox` Docker-group blocker remains OPEN and Production Judge remains NO. No real Submission or untrusted code ran. Next: Phase 6B-4 with `GPT-5.6 Sol` + high reasoning. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B3_REDIS_ACL_INTEGRATION_V1_REPORT.md`.

Docker Phase 6B-4 Sandbox Privilege Hardening V1 (2026-09-18): PASS on feature branch. Source and host audit proved Worker, Host Agent, Supervisor, direct rootless runc, systemd cgroup v2, Linux namespaces, and compiler rootfs execution do not depend on Docker CLI/API/socket or Docker-group membership. `oj-sandbox` was removed only from `docker`; fresh login and refreshed systemd-user processes now have primary group only, Docker socket/API access is denied, real-execution preflight and one fixed trusted runc probe passed, and task resources were cleaned. Repository gates prevent execution-cell Docker dependencies or provisioning regression; trusted WSL Docker infrastructure uses an explicit operator identity. Both known HIGH blockers are RESOLVED, but Production Judge remains NO pending Phase 6B-5 full sandbox regression and Phase 6B-6 production qualification. No user Submission or untrusted code ran. Next: Phase 6B-5 with `GPT-5.6 Sol` + high reasoning. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B4_SANDBOX_PRIVILEGE_HARDENING_V1_REPORT.md`.

Docker Phase 6B-4 Sandbox Privilege Hardening Integration V1 (2026-09-18): PASS. Feature commit `831a81446deaddb3b5229e4c69a3be3febf0a77a` was integrated through candidate `codex/docker-phase6b4-sandbox-privilege-hardening-v1-integration-v1` by no-ff merge `dadd00a0e4878312bf4d47d8c7eb160c385bc4c2`, preserving history without conflicts. Read-only live WSL verification confirmed fresh `oj-sandbox` and systemd-user contexts lack Docker group, Docker socket/API access is denied, execution-cell source/provisioning has no Docker runtime dependency, and trusted Docker infrastructure uses operator context. Both known HIGH blockers are RESOLVED; Production Judge remains NO pending Phase 6B-5 full sandbox regression and Phase 6B-6 production qualification. No user Submission or untrusted code ran. Next: Phase 6B-5 with `GPT-5.6 Sol` + high reasoning. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B4_SANDBOX_PRIVILEGE_HARDENING_INTEGRATION_V1_REPORT.md`.

Docker Phase 6B-5 Full Sandbox Security Regression V1 (2026-09-18): PASS / FEATURE COMPLETE on `codex/docker-phase6b5-sandbox-security-regression-v1`. Explicit dual-opt-in, task-isolated Ubuntu 24.04 WSL2 qualification ran 12 fixed trusted probes and 11 bounded repository-owned adversarial C++ fixture sources through non-root rootless-runc compile/runtime sandboxes. Network/host-loopback, filesystem/sibling/credential/Docker, process/PID, CPU/wall/memory/output, background/timeout/crash cleanup, cgroup/namespaces/mounts/capabilities/no-new-privileges, compiler/rootfs, symlink/traversal/artifact, testcase/submission/concurrency, malformed input, and fail-closed runc/rootfs/cgroup/workspace/network-launch boundaries passed with zero residue. CRITICAL=0, HIGH=0; three MEDIUM gaps remain: amd64 default-allow seccomp denylist, no `RLIMIT_NOFILE`, and no kernel compile-workspace quota/`RLIMIT_FSIZE`. Both known HIGH blockers remain RESOLVED. WSL sandbox regression is PASS; Production Judge remains NO, Linux amd64 PARTIAL, ARM64 NOT QUALIFIED, Mac NOT TARGET. Next: Phase 6B-6 production-like native Linux qualification using GPT-5.6 Sol + high reasoning. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B5_SANDBOX_SECURITY_REGRESSION_V1_REPORT.md`.

Docker Phase 6B-5 Sandbox Security Regression Integration V1 (2026-09-18): PASS. Feature `c8c6245e6cc305d982045792f00812dac8b8981f` integrated by no-ff merge `33dc2d417d81e262c482c4e3b622b2e650233c5f` through `codex/docker-phase6b5-sandbox-security-regression-v1-integration-v1`, preserving history without conflicts. WSL adversarial security regression remains PASS; CRITICAL/HIGH=0 and MEDIUM=3 (amd64 default-allow seccomp denylist, missing `RLIMIT_NOFILE`, missing kernel compile-workspace quota/`RLIMIT_FSIZE`) remain OPEN Phase 6B-6 acceptance inputs. Known HIGH blockers remain RESOLVED; Production Judge remains NO. No qualification was rerun in integration. Next: Phase 6B-6 with `GPT-5.6 Sol` + high reasoning. See `Docs/reports/OJPLATFORM_DOCKER_PHASE6B5_SANDBOX_SECURITY_REGRESSION_INTEGRATION_V1_REPORT.md`.

Docker Phase 6B-6 Production Judge Hardening + Native Linux Qualification V1 (2026-09-18): PARTIAL / FEATURE COMPLETE on `codex/docker-phase6b6-production-qualification-v1`. Production hardening and isolated WSL2 production-like prequalification PASS; native Linux amd64 host unavailable, final qualification PENDING, Production Judge NO. MEDIUM dispositions: amd64 default-allow seccomp `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL`; explicit `RLIMIT_NOFILE` RESOLVED; compile per-file `RLIMIT_FSIZE` implemented and aggregate workspace quota `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL`. Fresh Compose, second startup, restart/crash recovery, Redis ACL, Docker privilege, bounded 14-source sandbox regression, and cleanup passed; CRITICAL/HIGH/OPEN MEDIUM=0. Next: execute `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` on native Linux amd64. Report: `Docs/reports/OJPLATFORM_DOCKER_PHASE6B6_PRODUCTION_JUDGE_QUALIFICATION_V1_REPORT.md`.

Docker Phase 6B-6 Production Judge Hardening Integration V1 (2026-09-18): PASS / MERGED. Feature `742020ca668d053f644db95ff1a26ea359d23329` integrated via conflict-free no-ff merge `31c4bc1aac8b5b79afff8d334008bfbed70b4d10` in `codex/docker-phase6b6-production-qualification-v1-integration-v1`; feature history preserved. Overall Phase 6B-6 remains PARTIAL: production hardening and WSL2 prequalification PASS, native Linux amd64 final qualification PENDING, Production Judge NO. Seccomp amd64 default-allow and compile aggregate workspace limits remain `ACCEPTED_WITH_DOCUMENTED_COMPENSATING_CONTROL`; `RLIMIT_NOFILE` is RESOLVED; CRITICAL/HIGH/OPEN MEDIUM=0. Targeted static/security, Compose render, Worker, Supervisor, Redis ACL, Docker privilege, type/architecture/lint/format gates passed; fresh-deployment/restart/crash evidence remains feature qualification and was not rerun. Next: run `Docs/deployment/JUDGE_NATIVE_LINUX_QUALIFICATION_HANDOFF.md` on fresh native Linux amd64. Report: `Docs/reports/OJPLATFORM_DOCKER_PHASE6B6_PRODUCTION_JUDGE_INTEGRATION_V1_REPORT.md`.


Native Linux amd64 Production Judge Qualification V1 (2026-09-19): PASS on feature branch `codex/docker-native-linux-amd64-qualification-v1`, based on main `fa234f826b8e766ba7f29fd785243f3db5c966d7`. A dedicated Ubuntu 24.04.5 VMware x86_64 clone passed fresh production deployment, DB/Redis/secret/network isolation, native Phase 6B-5 sandbox security, real AC/WA/CE/RE/TLE artifact workflows, Worker crash/lease/incarnation recovery, dependency readiness transitions, component restarts, firewall/logging checks, and two guest reboots. Compiler rootfs identity is `cfb8d628eb7ef2ceb0257e27a1f82f2deb4eb312cfd3ca2498b302564a5a7e14`; CRITICAL/HIGH/OPEN MEDIUM = 0. `LINUX_AMD64_FULL_JUDGE = QUALIFIED`; `PRODUCTION_JUDGE_QUALIFIED = YES`; Linux ARM64 remains NOT QUALIFIED; Mac Judge remains NOT TARGET and Phase 5 Mac DEFERRED. See `Docs/reports/OJPLATFORM_NATIVE_LINUX_AMD64_PRODUCTION_JUDGE_QUALIFICATION_V1_REPORT.md`. Integration into main is pending.

Native Linux amd64 Judge Qualification Integration V1 (2026-09-19): PASS. Feature `f3700efab6c4582ed6cdf9f8bc3289d0ef494fbe` was integrated from live main `fa234f826b8e766ba7f29fd785243f3db5c966d7` through fresh candidate `codex/docker-native-linux-amd64-qualification-v1-integration-v1` by conflict-free no-ff merge `dff7ce3`, preserving feature history. Semantic audit found and fixed host-locale-dependent rootfs manifest ordering by pinning `LC_ALL=C`; two native VMware builds reproduced canonical identity `191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2` with unchanged rootfs entries. Bundle, scope, secret/path, rootfs, MinIO idempotency, artifact, Redis ACL, Worker readiness, lease/incarnation, TypeScript, architecture, Compose, focused Vitest, Worker/Supervisor Go, and full baseline-regression gates passed; new full-suite failing files = 0. Native AC/WA/CE/RE/TLE, 12 trusted + 14 bounded untrusted fixtures, restart/SIGKILL recovery, and two reboot results remain authoritative. Phase 6A and Phase 6B-1 through 6B-6 are PASS / MERGED; `LINUX_AMD64_FULL_JUDGE = QUALIFIED`; `PRODUCTION_JUDGE_QUALIFIED = YES`; CRITICAL/HIGH/OPEN MEDIUM = 0. Seccomp and aggregate workspace controls remain formally accepted; `RLIMIT_NOFILE` remains RESOLVED. Linux ARM64 remains NOT QUALIFIED; Mac Judge remains NOT TARGET; Phase 5 Mac remains DEFERRED. Report: `Docs/reports/OJPLATFORM_NATIVE_LINUX_AMD64_JUDGE_QUALIFICATION_INTEGRATION_V1_REPORT.md`.

Phase 7 Definition (2026-09-19): Phase 7 was formally defined for the first time as `Fresh-Machine Deployment & Bootstrap`; Phase 7A is `Standard Docker Compose Deployment + Linux Host Provisioning`. Prior `Phase 7–9 NOT STARTED` handoff text was a placeholder with no scope and remains historically accurate for the time it was written; it is not rewritten here.

Phase 7A Standard Docker Compose Deployment + Linux Host Provisioning V1 (2026-09-19): PARTIAL on feature branch `codex/phase7a-standard-deployment-v1` (based on live main `4bf0935ea5375b2a8eacd28b577934fea347efb1`), feature commits `62ca93d` and `4a58d0b`. Docker Compose remains the sole container orchestrator: no custom orchestration CLI or Docker wrapper was added. New artifacts: `.env.production.example` (documents every production-required variable; no real secret, no demo production password, no machine-specific absolute path), `deploy/judge-host/install.sh` (single root-only, strict-mode, idempotent, fail-closed host provisioning script covering prerequisites, service identities, AppArmor userns grant, directories/ownership, Worker/Supervisor/Host Agent builds, compiler rootfs with canonical identity enforcement, protected env files, systemd installation and post-install security gates; no destructive Docker cleanup; never grants a privileged group and actively removes one if found), `deploy/judge-host/systemd/{ojplatform-worker,ojplatform-host-agent,ojplatform-supervisor}.service`, `deploy/judge-host/apparmor/ojplatform-runc`, `Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md` (single deployment entry point) and `tests/deployment-contract.test.ts` (12 contract assertions). The previously reported Judge-only/Core-only coupling to `OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT` is RESOLVED: the Web service now defaults to the repository-local `./plugins/OnlineCodeEditor` context and Core/Judge-only renders no longer require a plugin path. Fresh clustered development also exposed and fixed two real defects: the OnlineCodeEditor checkout was a dormant `pnpm-workspace.yaml` glob that broke `pnpm install --frozen-lockfile` inside image builds, and the main Docker build context must exclude `plugins/` (the Web image still receives the plugin through its dedicated named `online-code-editor` build context). Validated: `bash -n deploy/judge-host/install.sh`; Prettier/ESLint on changed files; `pnpm typecheck`; architecture gate; 73/73 focused Vitest including the new deployment contract; Worker and Supervisor Go tests/vet/gofmt on Linux; production Compose render with and without `--profile judge`; `.env.production.example` value interpolation; self-contained Host Agent ESM bundle start (HTTP 200); canonical full-stack deploy of the control plane on a brand-new disposable VMware clone (`OJPlatform-Phase7A-FreshDeploy-V1`, no repo, no node/go/pnpm, no Docker volumes, fresh `git clone` from bundles) where `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build` completed in 2m11s, all six long-lived services reported healthy, all five one-shot bootstrap/migration jobs exited 0, only Web was publicly published, API/Judge Service/Worker Redis were loopback-only, and the Web image served `200` on `/`, `/ready` and the API health proxy with CodeMirror editor assets bundled. NOT VERIFIED / BLOCKED: the fresh VM has no root access for the `ojplatform` user (no root SSH key, no passwordless sudo), so `deploy/judge-host/install.sh`, the host execution cell, `EXECUTION_READY`, real AC/WA/CE/RE/TLE verdicts, reboot recovery, the second Compose run and the second `install.sh` run remain NOT RUN. ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION = BLOCKED: the OnlineCodeEditor repository has no authoritative Git remote (`.git/config` has no `[remote]` section), so no submodule can be pinned without inventing one; a checkout is documented at `plugins/OnlineCodeEditor`. `PRODUCTION_JUDGE_QUALIFIED = YES` and `LINUX_AMD64_FULL_JUDGE = QUALIFIED` are unchanged by this phase. Linux ARM64 remains NOT QUALIFIED; Mac Judge remains NOT TARGET; Phase 5 Mac remains DEFERRED. Report: `Docs/reports/OJPLATFORM_PHASE7A_STANDARD_DEPLOYMENT_V1_REPORT.md`.

Phase 7A Standard Docker Compose Deployment + Linux Host Provisioning V1 - Full Fresh-Machine E2E Completion (2026-09-19): PASS for implementation and E2E qualification on feature branch `codex/phase7a-standard-deployment-v1`. The previously blocked host install was executed by the operator (root is not delegated to the agent) and then driven to completion without further privileged actions. On the disposable fresh VM `OJPlatform-Phase7A-FreshDeploy-V1` (brand-new full clone: no repository, no Go/Node/pnpm, no Docker volumes, no images) the canonical two-command flow was verified end to end: `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build` and `sudo ./deploy/judge-host/install.sh`. Evidence: all six long-lived services healthy and all five one-shot bootstrap/migration jobs exited 0; only Web published publicly (`0.0.0.0:8080`) with API/Judge Service/Worker Redis/Supervisor loopback-only (19092, 19093, 13180, 3100, 3010, 6379); `deploy/judge-host/install.sh` finished with all 15 security gates OK; systemd units `ojplatform-worker.service` and `ojplatform-host-agent.service` active+enabled as `oj-worker`/`oj-host-agent`, and `ojplatform-supervisor.service` active as the non-root `oj-sandbox` user unit bound to `127.0.0.1:19092`; `oj-sandbox` primary group only with Docker socket unreadable; compiler rootfs `root:root 555` with canonical identity `191cb6c71d4792e4e78d70882b229eec2b3a028314ca3c15e4e3a1847850eda2`; Worker readiness `control_plane/redis/supervisor = true`; Judge Service `EXECUTION_READY` with `schedulableNodes=1` and `availableSlots=1`. Real Product-to-Judge workflows through immutable JudgeData artifacts produced `AC`, `WA`, `CE`, `RE` and `TLE` verdicts (all five, before and again after a guest reboot), and the OnlineCodeEditor was verified as real CodeMirror DOM (`.cm-editor`, `.cm-content`, `.cm-gutters`, `cm-line`) with accepted typing and zero page errors. Idempotency: a second Compose run was a single-pass success with identical data counts (submissions=10, problems=7, users=7) and all one-shot jobs exiting 0 again; a second `install.sh` run reported `SECOND_INSTALL_RUN=PASS` with existing users, reused compiler rootfs, refreshed derived host env and all gates OK; after `systemctl reboot` the Docker stack, all three units, Redis ACL, rootfs identity, `oj-sandbox` privilege boundary and `EXECUTION_READY` all recovered automatically without re-running the installer. Defects found and fixed during qualification (each with executed evidence): `seccomp` capability check used a case-sensitive match against `/proc/self/status`; `unit_dir` assignment and ten `gate "$gate_x"` call sites were unbound-variable bugs under `set -u`; `install.sh` was written with CRLF line endings; the OnlineCodeEditor checkout was a dormant `pnpm-workspace.yaml` glob and entered the main Docker build context (breaking `pnpm install --frozen-lockfile`); Host Agent bundling required workspace `node_modules` and an unresolvable `fastify`; `umask 0027` left binaries at `0750` and the Host Agent `node_modules` unreadable, causing `203/EXEC` and `ERR_MODULE_NOT_FOUND`; `/etc/ojplatform` was not traversable by the unprivileged user manager; the Worker queue prefix did not match the Compose Redis ACL prefix (`NOPERM`, permanently `DEGRADED`); derived host env files were frozen at first write instead of reconciled; the Supervisor readiness gate raced process startup; two untyped helpers in `tests/deployment-contract.test.ts` broke the production API image build via `tsconfig.build.json`. `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION` remains BLOCKED: the OnlineCodeEditor repository has no authoritative Git remote (`.git/config` has no `[remote]` section), so the checkout stays an external, repository-local `plugins/OnlineCodeEditor` acquisition and Phase 7A overall remains PARTIAL on that single item. `PRODUCTION_JUDGE_QUALIFIED = YES` and `LINUX_AMD64_FULL_JUDGE = QUALIFIED` are unchanged. Report: `Docs/reports/OJPLATFORM_PHASE7A_STANDARD_DEPLOYMENT_V1_REPORT.md`.

Phase 7A OnlineCodeEditor Authoritative Remote + Submodule Acquisition V1 (2026-09-19): BLOCKED. This task attempted to close the single remaining Phase 7A blocker, `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION`. Live audit confirmed the OnlineCodeEditor repository at `D:\OJPlatformPlugins\OnlineCodeEditor` (branch `main`, HEAD `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`, 29 commits, 77 tracked files, 880 KB of history, no tracked modifications) has **no remote at all** (`git remote -v` empty, no `remote.*` config), and the `gh` CLI is not installed, so no repository could be created or searched programmatically. Unauthenticated inspection of the GitHub account `wyl20020808` showed six public repositories (`OJ` empty, `word-memo-server`, `test`, `Wyl_OnlineJudge`, `games`, `justoj`) and none is an OnlineCodeEditor/plugin repository; the two older Online Judge projects are unrelated and were deliberately not bound. The user created `https://github.com/wyl20020808/OJ` (public, verified empty: size 0, zero refs, default branch `main`) but then clarified that `OJ` is intended for the **OJPlatform main repository**, not for the plugin; consequently no plugin history was pushed anywhere and the OJPlatform remote was not published either (`OJPLATFORM_REMOTE_PUBLICATION = PENDING`). Positive results delivered: plugin secret and large-file audit PASS (no secret-like filenames, no key/token patterns in any reachable commit, no blob above 1 MB, no build output tracked); plugin independent validation PASS (`npm run typecheck` clean, 20 test files / 56 tests passed, `npm run build` succeeded); and a full submodule suitability audit confirming the plugin is an independent repository with its own package.json, tracked `package-lock.json`, own build/test toolchain and self-contained source tree, and confirming that adopting it as `plugins/OnlineCodeEditor` re-introduces none of the Phase 7A regressions already fixed (`pnpm-workspace.yaml` contains only `apps/*` and `packages/*` so no workspace coupling; `.dockerignore` excludes `plugins` so the main Docker build context stays clean; `Dockerfile.web` consumes the plugin through the dedicated `online-code-editor` named context and copies only `/src`, `/package.json` and `/plugin.manifest.json`, so no `.git` metadata reaches the runtime image; `compose.yaml` already defaults to the repository-relative `./plugins/OnlineCodeEditor` and the plugin path never blocks Core-only or Judge-only renders). The only repository-side change still required is a `.gitignore` exception for `plugins/OnlineCodeEditor` once the gitlink lands; it was intentionally not applied while no submodule exists. `.gitmodules` was therefore not created, no floating branch tracking was introduced, and the intended pin remains `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`. `PHASE_7A` remains PARTIAL on this single blocker; `PHASE_7A_IMPLEMENTATION = PASS`, `PHASE_7A_E2E = PASS`, `ONLINE_CODE_EDITOR_INCLUDED_IN_WEB_IMAGE = YES`, `JUDGE_ONLY_WEB_PLUGIN_COUPLING = RESOLVED`, `PRODUCTION_JUDGE_QUALIFIED = YES`, `LINUX_AMD64_FULL_JUDGE = QUALIFIED`, `MAIN_DEPLOY_COMMAND_COUNT = 2` and no custom orchestrator was added. OJPlatform `main` was not modified and not merged. Report: `Docs/reports/OJPLATFORM_PHASE7A_ONLINECODEEDITOR_ACQUISITION_V1_REPORT.md`.

Phase 7A OnlineCodeEditor Authoritative Remote + Submodule Acquisition V1 - COMPLETION (2026-09-19): PASS. The final Phase 7A blocker, `ONLINE_CODE_EDITOR_FRESH_CLONE_ACQUISITION`, is resolved. The user created a dedicated public plugin repository `https://github.com/wyl20020808/OnlineEditor` (verified public, empty: size 0, zero refs, default branch `main`, not a fork); `https://github.com/wyl20020808/OJ` was explicitly reserved by the user for the OJPlatform main repository and was therefore not used for the plugin. Before publication the plugin history passed a secret/large-file audit (no `.env`/key/token filenames, no private-key or cloud-key patterns in any reachable commit, no blob above 1 MB, no build output tracked). `origin` was added over HTTPS with no embedded credential and `git push -u origin main` published exactly one branch; `origin/main` == local `main` == `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`, and a fresh temporary clone of the remote reproduced HEAD `09877bf` with 77 files. OnlineCodeEditor is now a pinned Git submodule at `plugins/OnlineCodeEditor` (mode 160000 gitlink to `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`, `.gitmodules` url `https://github.com/wyl20020808/OnlineEditor.git`, deliberately no `branch =` entry so the build never follows the plugin's remote main); `.gitignore` gained the `!plugins/OnlineCodeEditor` exception so the gitlink can be tracked while stray `plugins/*` checkouts stay excluded. Both acquisition paths were exercised on real independent checkouts: `git clone --recurse-submodules` populated the plugin from GitHub on a fresh disposable VM, and a plain clone followed by `git submodule update --init --recursive` registered and cloned it, checking out the pinned commit; neither path copied, seeded or rsynced a local plugin checkout. Docker integration re-verified: the Web image built from the submodule-acquired source both locally in WSL and on the fresh VM (`up -d --build web`, 5m20s, container then ran the new image `fa2941cc9bb5`), the runtime image contains CodeMirror in the served bundle and no `.git` directory, no plugin source tree and no `plugin.manifest.json`, and a DOM-level browser smoke against that image passed (`.cm-editor`, `.cm-content`, `.cm-gutters`, `cm-line`, accepted keyboard input, zero page errors). Regression gates held: `pnpm install --frozen-lockfile` still passes across 14 workspace projects with the plugin excluded from the workspace, `.dockerignore` still excludes `plugins` from the main build context, Core-only and Judge-profile Compose renders both pass with no plugin variable set and resolve the Web plugin context to the repository-local submodule, `pnpm typecheck`/`build`/architecture gate pass, and `tests/deployment-contract.test.ts` is now 24 tests including the submodule pin, gitlink mode, no-machine-path and ignore-exception contracts. `MAIN_DEPLOY_COMMAND_COUNT` remains 2 with no custom orchestrator; the 15 security gates, `deploy/judge-host/install.sh` and the systemd units are untouched. `PHASE_7A = PASS` (implementation PASS, E2E PASS, acquisition PASS); `ONLINE_CODE_EDITOR_INCLUDED_IN_WEB_IMAGE = YES`; `JUDGE_ONLY_WEB_PLUGIN_COUPLING = RESOLVED`; `PRODUCTION_JUDGE_QUALIFIED = YES`; `LINUX_AMD64_FULL_JUDGE = QUALIFIED`; Linux ARM64 NOT QUALIFIED; Mac Judge NOT TARGET; Phase 5 Mac DEFERRED. `OJPLATFORM_REMOTE_PUBLICATION = PENDING`. OJPlatform `main` was not modified and not merged. Report: `Docs/reports/OJPLATFORM_PHASE7A_ONLINECODEEDITOR_ACQUISITION_V1_REPORT.md`.

Phase 7A Integration Into Main V1 (2026-09-19): PASS / MERGED. The Phase 7A feature history `codex/phase7a-standard-deployment-v1` (15 commits, base `4bf0935ea5375b2a8eacd28b577934fea347efb1`) was integrated through the fresh candidate `codex/phase7a-standard-deployment-v1-integration-v1` with a conflict-free `--no-ff` merge `c4f0a51bd8a1cf4dc9c66219d2fa0f8bbd6a3dd2`, preserving every feature commit and the plugin submodule gitlink. Integration-side follow-up commits: `c9e04c3` (corrected a now-stale `.gitignore` comment that still claimed the plugin was never committed) and `ac7ef78` (dev tooling now resolves the plugin from the submodule: `apps/web/vite.config.ts` fallback became cwd-independent and points at `plugins/OnlineCodeEditor`, and `scripts/dev-runtime.ps1` prefers the repository-local submodule while keeping the legacy absolute paths as a last-resort fallback; documented that a host-only `pnpm build:web` needs `cd plugins/OnlineCodeEditor && npm ci` once, while the Docker Web build installs plugin dependencies itself). Verification executed on the integration tree: submodule integrity (mode 160000 gitlink to `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`, `.gitmodules` public HTTPS URL, no `branch =`); fresh acquisition on two independent checkouts (plain clone then `git submodule update --init --recursive`, and `git clone --recurse-submodules`), both fetching the plugin from GitHub with HEAD equal to the gitlink; plugin independent validation in the freshly acquired submodule (`npm ci`, typecheck clean, 20 test files / 56 tests passed, `npm run build` succeeded); OJPlatform validation (`pnpm install --frozen-lockfile`, typecheck, build, architecture gate, ESLint, Prettier, 46 focused Vitest tests including the 24-test deployment contract, `pnpm -r` confirming the plugin is not a workspace member); Core-only and Judge-profile Compose renders both passing with no plugin variable set and resolving the Web plugin context to the repository-local submodule; `scripts/qualify-production-judge-config.mjs` PASS; Docker Web build from a fresh submodule-acquired checkout both locally and on the dedicated fresh VM, where the container was force-recreated onto the new image and the runtime image was confirmed to contain CodeMirror in the served bundle with no `.git` directory, no plugin source tree and no `plugin.manifest.json`; a DOM-level browser smoke against that integration build passing (`.cm-editor`, `.cm-content`, `.cm-gutters`, `cm-line`, accepted C++ keyboard input, zero page errors, screenshot `editor-dom-smoke-integration.png`); and a secret/machine-path audit of the integration tree finding no secrets, no credentials and no machine-specific plugin path in any executable or configuration file (the only `D:\OJPlatformPlugins` references left are inside historical `Docs/reports/` records and the intentional last-resort fallback added to `scripts/dev-runtime.ps1`). Deployment contract unchanged: two commands, `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build` and `sudo ./deploy/judge-host/install.sh`, with no custom orchestrator. `PHASE_7A = PASS` and `PHASE_7A_ON_MAIN = YES`; `PRODUCTION_JUDGE_QUALIFIED = YES`; `LINUX_AMD64_FULL_JUDGE = QUALIFIED`; Linux ARM64 NOT QUALIFIED; Mac Judge NOT TARGET; Phase 5 Mac DEFERRED; `OJPLATFORM_REMOTE_PUBLICATION = PENDING` (nothing was pushed to the OJPlatform remote). The Phase 7A feature branch and worktree are retained for audit and rollback.

Phase 7B One-Command Production Deployment V1 - Implementation Checkpoint (2026-09-19): PARTIAL. Phase 7B was defined as `Production Publication + One-Command Fresh Host Deployment` with the target UX `git clone --recurse-submodules https://github.com/wyl20020808/OJ.git` -> `cd OJ` -> `sudo ./deploy/install.sh`. Delivered on feature branch `codex/phase7b-one-command-deployment-v1` (based on live main `56a68e74ea43e7f3045589362d50b585fae3faa3`, which remains unmodified and unmerged): host build-toolchain removal (`98c3648`), the one-command installer (`abaae1a`), a read-only deployment doctor (`6ad205a`, hardened for non-root use in `635eab6`), the deployment contract test suite (`638c1b1`), and the fresh-host documentation (`75cbbbe`). Host toolchain minimization is real, not a wrapper: the Worker, trusted probe and Supervisor are now compiled inside a pinned `golang:1.22-bookworm` builder container with `CGO_ENABLED=0` and `GOPROXY=off` writing directly to `/opt/ojplatform/bin`, pnpm is gone (the Host Agent bundle is built with `npx --yes esbuild@0.28.2` and its single runtime dependency installed with `npm --prefix ... install --omit=dev`), and the Host Agent itself became optional (`auto` installs it only when a Node runtime already exists; `--with-host-agent` requires Node; `--skip-judge-host` supports control-plane-only hosts). Executed evidence: the builder produced three stripped, statically linked ELF x86-64 binaries (5.8 MB / 6.1 MB / 2.2 MB) and the supervisor binary runs. `deploy/install.sh` (mode 100755) performs a fail-closed x86_64-only preflight (Linux, systemd, cgroup v2, >= 2 CPU, >= 4 GiB RAM, >= 15 GiB free on /var/lib), installs Docker Engine/CLI/containerd/buildx/Compose-v2 from the official Docker repository only when they are missing (never disabling a firewall or loosening the Docker socket), acquires the pinned OnlineCodeEditor submodule and aborts on gitlink drift while never running `git pull`, generates `.env` at 0600 with cryptographically random secrets that are never printed and never regenerated, refuses to start on top of unrelated listeners without killing any process, runs the documented `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`, waits for real health of postgres/redis/minio/api/web/judge-service plus application endpoints and a genuine served-bundle OnlineCodeEditor check before printing success, and delegates the host execution cell to `deploy/judge-host/install.sh` without duplicating Judge logic. `deploy/doctor.sh` is strictly read-only, reports host/Docker/repository/submodule/env-presence/services/units/privilege boundaries/endpoints/storage/listeners, and ends with `DEPLOY_DOCTOR=PASS` or `DEPLOY_DOCTOR=FAIL`; it was executed successfully on the Ubuntu 24.04 VM (exit 0, Supervisor loopback listener verified) and degraded the identity-assuming checks to informational lines when run without root instead of reporting false failures. Validation executed in this checkpoint: `bash -n` on all three scripts; shellcheck with zero warnings; the Dockerised Go builder; `pnpm install --frozen-lockfile`; typecheck; build; architecture gate; ESLint/Prettier on changed files; 39/39 contract tests across `tests/deployment-contract.test.ts` (26) and `tests/production-install-contract.test.ts` (13); focused judge/redis/sandbox regression; `qualify-production-judge-config.mjs`; `git diff --check`. NOT FINISHED and therefore not claimed: the full `sudo ./deploy/install.sh` run on a host (the disposable VM's account has no passwordless sudo, so the privileged step needs one operator action), the Docker-absent bootstrap branch, Judge and browser E2E plus reboot survival and second-run idempotency on a fresh Phase 7B host, the secret/history audit and publication of `main` to `https://github.com/wyl20020808/OJ.git`, and integration into live `main`. Nothing partial was applied to `main`; all work is committed on the feature branch with a clean worktree. Report: `Docs/reports/OJPLATFORM_PHASE7B_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.

Phase 7C Windows One-Command Deployment Preview + Closeout V1 (2026-09-20): PASS / PREVIEW COMPLETE on feature branch `codex/phase7c-windows-one-command-deployment-v1` (base `d785b36aab5306c31f774344394e87899a74c981`, feature commits `8a0ee5a`, `6546ddd`, `b3ef53d`, `eade7ee`, `e07bc6c`, `fef3335`, `a89f2c2`, plus closeout commits `d13575c`, `efe03ff`). Windows 11 x86_64 + WSL2 is a bootstrap host only: `deploy/install-windows.ps1` validates Windows/virtualization/resources, installs WSL2 + Ubuntu 24.04, enables systemd, clones the public repository into WSL ext4, delegates to the authoritative `deploy/install.sh`, validates services, and registers a credential-free at-logon WSL startup task with a bounded three-attempt reboot resume; `deploy/bootstrap-windows.ps1` covers a Windows host without Git using only the official winget `Git.Git` package; `deploy/doctor-windows.ps1` is read-only and ends in `WINDOWS_DEPLOY_DOCTOR=PASS`/`FAIL`. Physical-host functional qualification PASS on a Windows 11 Home build 26200 host with an existing WSL2 installation: install, Web, API, database, Judge AC/WA/TLE/MLE/CE/RE, OnlineCodeEditor in Edge with CodeMirror DOM, keyboard input and zero captured fatal JS errors, second-install idempotency, persistence fingerprint, `DEPLOY_DOCTOR=PASS`, `WINDOWS_DEPLOY_DOCTOR=PASS`, and Windows-to-WSL localhost validation. `WINDOWS_FRESH_HOST_QUALIFICATION = DEFERRED`: no clean Windows host without WSL2 was available (the host has no Hyper-V role and the active Microsoft hypervisor/VBS path blocks nested VT-x for VMware), so the fresh no-WSL2 bootstrap and reboot-resume paths are NOT VERIFIED; no host boot configuration, VBS, HVCI, firewall or reboot change was made. Judge tail closed with live product-path evidence on the same host (`scripts/phase7c-judge-tail-e2e.mjs`): the reported `Judge Service 409` was a reused Judge Service idempotency identity (`artifactJudgeServiceInput` hardcoded `clientRequestId = submission:<id>:evaluation:1` for every generation) that `JudgeServiceClient` then collapsed into a retryable `JUDGE_DISPATCH_UNAVAILABLE` 503; the request identity is now generation-scoped and Judge Service 404/409/501 map to their own non-retryable domain statuses. `POST /api/submissions/:id/judge/cancel` now cancels through the Judge Service control plane instead of the API-local Redis judge keyspace that never owns production jobs (previously 404 in production), and reuses the Judge Service result digest so the progress bridge and read-side projection stay idempotent. Executed results: real registration and password login, problem and Judge Data authoring, AC verdict, WA verdict, rejudge -> HTTP 200 with generation 2 executed on the real Worker and verdict AC, cancel of an in-flight TLE submission -> HTTP 200 `CANCELLED`, `CANCELLED` with no verdict still persisted after the worker finished, and submission detail reads HTTP 200. `REJUDGE_E2E = PASS`, `CANCEL_E2E = PASS`, `NORMAL_AC_WA_REGRESSION = PASS`. Documentation is now Chinese-first on GitHub: `README.md` is the Chinese landing page with the feature list, Linux and Windows quick starts, Windows Preview note, Chinese navigation and a deployment status table, while `README.en.md` and `README.zh-CN.md` remain the complete English and Chinese references; `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md` states `WINDOWS_FUNCTIONAL_QUALIFICATION = PASS` and `WINDOWS_FRESH_HOST_QUALIFICATION = DEFERRED` and no document claims a qualified Windows production path. Validation executed: `pnpm typecheck`, `pnpm build`, architecture gate, 55/55 deployment/Windows contract tests, 28/28 Judge/worker-control/artifact tests, repository Vitest baseline identical to the pre-existing 15 failing files / 47 failing tests with no new failure, `PRODUCTION_JUDGE_CONFIG_QUALIFICATION=PASS`, core and judge Compose renders, OnlineCodeEditor pinned submodule typecheck/56 tests/build, PowerShell 5.1 parser on 8 scripts, `bash -n`, relative-link and anchor check (0 broken), and `git diff --check`; PSScriptAnalyzer and shellcheck are not installed in this environment and are recorded as NOT AVAILABLE. `PHASE_7C_WINDOWS_FUNCTIONAL = PASS`, `PHASE_7C_WINDOWS_FRESH_HOST = DEFERRED`, `PHASE_7C = PREVIEW_COMPLETE`, `WINDOWS_ONE_COMMAND_DEPLOYMENT = PREVIEW` (never FULLY QUALIFIED / Fresh Windows Supported), `PHASE_7B = PASS / MERGED / PUBLISHED`, `PRODUCTION_JUDGE_QUALIFIED = YES`, `LINUX_AMD64_FULL_JUDGE = QUALIFIED`, Linux/Ubuntu 24.04 x86_64 remains Production Qualified, Linux ARM64 NOT QUALIFIED, Mac Judge NOT TARGET, Phase 5 Mac DEFERRED. Deferred qualification remains a single follow-up: fresh Windows no-WSL2 bootstrap + reboot resume. Report: `Docs/reports/OJPLATFORM_PHASE7C_CLOSEOUT_V1_REPORT.md`.
