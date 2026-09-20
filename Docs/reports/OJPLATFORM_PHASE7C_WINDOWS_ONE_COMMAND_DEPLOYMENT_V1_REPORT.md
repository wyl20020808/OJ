# Phase 7C Windows One-Command Deployment V1 Report

Date: 2026-09-20  
Status: **PARTIAL / IMPLEMENTED / CLEAN-HOST QUALIFICATION BLOCKED**

## Goal

Provide a foolproof Windows 11 x86_64 bootstrap that runs the existing Ubuntu
24.04 production deployment under WSL2. Windows remains a bootstrap host;
`deploy/install.sh` remains the sole production installer.

## Implemented

Feature branch: `codex/phase7c-windows-one-command-deployment-v1`  
Base: `d785b36aab5306c31f774344394e87899a74c981`  
Implementation commits: `8a0ee5a`, `6546ddd`, `e07bc6c`, `fef3335`

- `deploy/install-windows.ps1`
  - PowerShell 5.1 entry point with automatic `RunAs` elevation and argument/path
    preservation.
  - Windows 11 build 22000+, x86_64, RAM, disk, virtualization, pending reboot,
    WSL and distro checks; unsupported targets fail closed.
  - Official `wsl.exe --update`, WSL2 default, advertised `Ubuntu-24.04`
    installation, WSL1 conversion refusal/reconciliation, and first-launch root
    initialization without a UNIX username/password prompt.
  - Dedicated passwordless (not sudo-passwordless) `ojplatform` Linux account;
    no Windows credential enters Linux.
  - Safe `/etc/wsl.conf` systemd enablement, WSL shutdown only when required,
    and PID 1 verification.
  - Public recursive clone to WSL ext4 at `/home/ojplatform/OJ`, official origin
    verification, pinned OnlineCodeEditor verification, and exact scoped Git
    safe-directory entries for the root installer context.
  - Delegation to `./deploy/install.sh --non-interactive` and
    `./deploy/doctor.sh`; no PowerShell copy of Docker, Compose, DB, environment,
    Judge, or health orchestration.
  - Windows localhost Web/API validation and final access URL.
  - Streaming WSL/Git/apt output, bounded apt network retries/timeouts, safe
    Base64 shell transport, and actionable failure logging instead of a silent
    package-install wait.
  - Existing-distro capacity checks against the WSL root filesystem rather than
    the unrelated Windows system drive; noisy WSL warnings are filtered before
    numeric parsing.
  - Bounded three-attempt reboot resume using a secret-free ProgramData state
    file and one idempotent at-logon task. Success removes temporary resume
    state/task.
  - Minimal credential-free `OJPlatform-WSL-Startup` at-logon task to start the
    user-owned WSL distro after Windows reboot. No firewall rule or portproxy.
- `deploy/bootstrap-windows.ps1`
  - Supports a Windows host without Git by using the official winget `Git.Git`
    package. Without winget it fails with the official Git URL rather than
    downloading an untrusted binary.
  - Clones only the public OJPlatform repository recursively, verifies an
    existing checkout origin, and invokes the primary installer.
- `deploy/doctor-windows.ps1`
  - Read-only Windows/WSL/distro/systemd/disk/Linux-doctor/localhost/startup-task
    checks ending in `WINDOWS_DEPLOY_DOCTOR=PASS` or `FAIL`.
- Bilingual GitHub landing documentation:
  - concise `README.md` with prominent `简体中文 | English` navigation;
  - complete `README.zh-CN.md` and `README.en.md`;
  - detailed `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md`.
- Configurable npm registry build arguments retain the official npm registry as
  default while permitting recovery from a locally unreachable registry.
- The Web nginx proxy re-resolves Docker DNS, preventing stale API addresses
  after an idempotent API container recreate.
- `tests/windows-production-install-contract.test.ts`: 13 contract tests for
  architecture, support boundaries, elevation, official WSL/Git acquisition,
  bounded resume, credential handling, systemd, ext4 checkout, localhost,
  doctor behavior, and bilingual navigation.

Existing Windows development workflow `scripts/dev-runtime.ps1` is untouched.
`deploy/install.sh` remains authoritative and the Compose architecture is
unchanged; only build-network configurability and proxy DNS resilience changed.

## Validation executed

| Gate | Result |
| --- | --- |
| PowerShell 5.1 parser, all three new scripts | PASS |
| Phase 7C + Phase 7B deployment contract tests | PASS, 52/52 |
| TypeScript typecheck | PASS |
| Production TypeScript build | PASS |
| Architecture dependency gate | PASS |
| Changed test ESLint | PASS |
| Changed Markdown/test Prettier | PASS |
| Git diff whitespace check | PASS |
| Full repository Vitest | Existing baseline failures: 82 files passed, 15 failed, 1 skipped; 995 tests passed, 47 failed, 10 skipped. Failures are unrelated existing Web contracts; no Phase 7C test failed. |

No secret, password, token, VM image, ISO, generated qualification state, or
machine-specific qualification artifact is tracked.

## Current physical-host functional qualification

A non-destructive functional qualification was completed on the physical
Windows 11 host using a dedicated WSL2 distro. This evidence validates the
existing-WSL reuse path only; it is not clean-host or public-main evidence.

- Distro: `OJPlatform-Phase7C-Functional`, Ubuntu 24.04.5 LTS, WSL2, systemd as
  PID 1, isolated ext4 VHDX on `D:`. Existing `Ubuntu-24.04` and
  `docker-desktop` distros were not modified.
- The installer completed through Linux production installation, Linux doctor,
  Windows localhost validation, and startup-task registration. A second full
  installer run completed after hardening package progress, WSL warning parsing,
  and dynamic Docker DNS behavior.
- `deploy/doctor.sh`: `DEPLOY_DOCTOR=PASS`.
- `deploy/doctor-windows.ps1`: `WINDOWS_DEPLOY_DOCTOR=PASS`; Web and API both
  returned HTTP 200 through `http://localhost:8080`.
- Real password registration, email verification endpoint, session cookie,
  CSRF cookie/header, problem creation, Judge data publication, submission API,
  DB, queue, Judge Service, Worker, and Supervisor were exercised end to end.
- Post-second-install verdict evidence:
  - AC `87445428-87d5-4fc2-9a04-9a1ae476ded3`
  - WA `1cf539e2-6052-4070-8159-af71737cb0e0`
  - TLE `a7b2e097-8928-46b0-8e9c-7527d00e99cf`
  - MLE `2d67d59c-260d-44dd-901d-8907d2783f21`
  - CE `6970691b-0b65-47e2-b6d7-e8db38dc0bd1`
  - RE `172c831d-0a22-466f-8912-39fc2f75b624`
- Windows Edge loaded the production problem page and verified `.cm-editor`,
  `.cm-content`, `.cm-gutters`, keyboard input, and zero uncaught page errors.
- Persistence fingerprint retained the repository/plugin identities, `.env`
  hash, and Docker-volume-set hash. Data remained present; problem/submission
  counts increased only through the subsequent qualification run.
- An API-container IP-change test proved `/ready` remained available without
  restarting Web after nginx dynamically re-resolved `api`.
- Qualification-only mail sink, provider override, code file, and process were
  removed; the production API was restored and both doctors passed afterward.

Rejudge was attempted but is **NOT VERIFIED**: Judge Service returned HTTP 409
for evaluation generation 2, which API currently surfaced as
`JUDGE_DISPATCH_UNAVAILABLE` HTTP 503. Cancellation was not exercised. These are
recorded as follow-up and do not invalidate the required AC/WA/TLE/MLE Windows
functional gate.

## Local VM discovery and qualification blocker

The requested `DISCOVER_AND_QUALIFY_EXISTING_WINDOWS_VM` audit was rerun without
assuming the earlier VMware result applied to every local VM.

### Host

- Physical host: MSI Z790 x86_64, Windows 11 Home China build 26200.
- Microsoft hypervisor: active (`HypervisorPresent=true`, `vmcompute`, `HvHost`,
  HNS and WSL services present). WSL 2.7.12 with kernel 6.18.33.2 runs existing
  `docker-desktop` and `Ubuntu-24.04` distributions as WSL2.
- VBS: enabled and running (`VirtualizationBasedSecurityStatus=2`, hypervisor
  enforced code integrity service running).
- Full Hyper-V management: not installed/supported by this Home edition. The
  Hyper-V PowerShell module and `Get-VM` command are both absent; this is not
  merely a non-admin `Get-VM` failure. Read-only optional-feature and boot-store
  queries require an elevated shell and were not used to change the host.
- VMware Workstation: 17.6.4, authorization/NAT/DHCP/USB services running,
  `vmrun` available. VMware is operating through the active Microsoft
  hypervisor compatibility path.
- VirtualBox/QEMU/Multipass/Parallels: no installed runtime or inventory found.

### Local VM inventory

VMware's registered inventory, `vmrun list`, VMware recent configuration, and
only the normal local VM directories were checked. No full-disk scan was used.

| VM | Hypervisor | Guest | State | Snapshot | Nested candidate |
| --- | --- | --- | --- | --- | --- |
| OJPlatform-NativeLinux-AMD64 | VMware 17.6.4 | Ubuntu x86_64 | stopped | `clean-base` | no (`vhv.enable=FALSE`) |
| OJPlatform-NativeLinux-AMD64-Qualification-V1 | VMware 17.6.4 | Ubuntu x86_64 | stopped | none | no (`vhv.enable=FALSE`) |
| OJPlatform-Phase7A-FreshDeploy-V1 | VMware 17.6.4 | Ubuntu x86_64 | stopped | none | no (`vhv.enable=FALSE`) |
| OJPlatform-Phase7B-Public-Final-V1 | VMware 17.6.4 | Ubuntu x86_64 | stopped | none | no (`vhv.enable=FALSE`) |

No Windows 11 or Windows 10 VM exists in VMware inventory or the normal local VM
directories. Therefore there is no Windows base VM to inspect for existing WSL2
and no safe Windows VM to clone. Existing Linux base VMs were not modified.

### Local paths evaluated

1. **Existing Windows VM with working WSL2:** unavailable; every discovered VM
   is Ubuntu.
2. **Hyper-V disposable Windows clone with nested extensions:** unavailable;
   this Windows Home host lacks the full Hyper-V role/module and has no general
   Hyper-V VM inventory to clone or configure with `Set-VMProcessor`.
3. **Existing VMware Windows VM already exposing nested VT-x:** unavailable; no
   Windows VMware VM exists.
4. **New disposable VMware Windows VM:** the official Windows 11 Enterprise
   Evaluation x64 path was attempted previously. VMware rejected
   `vhv.enable=TRUE` with `This platform does not support virtualized Intel
   VT-x/EPT` while the Microsoft hypervisor/VBS stack is active. A guest without
   nested VT-x cannot run WSL2 and cannot qualify Phase 7C.

The only remaining local path is temporarily disabling the host Microsoft
hypervisor/VBS boot path, rebooting, qualifying a disposable VMware Windows VM,
then restoring the host setting and rebooting again. This affects the user's
working WSL/Docker environment and remains prohibited without explicit approval.

## Not verified

- Clean Windows first installation, duration, reboot count, UAC count, automatic
  resume, and fresh no-Git bootstrap.
- Real Windows reboot recovery and startup task after a host reboot.
- Cancel and rejudge paths; rejudge has the failure documented above.
- Integration into `main`, public bootstrap, and public qualification. No
  unqualified Windows claim has been merged or pushed.

## Required next action

Current-host functional qualification is complete. To finish the clean-host
qualification locally, explicit approval is needed
to perform the reversible host-hypervisor switch and two host reboots:

1. record the current boot/hypervisor/VBS configuration;
2. disable only the Microsoft hypervisor boot launch, then reboot;
3. create and qualify a disposable VMware Windows 11 clone with nested VT-x;
4. restore the exact original boot configuration and reboot;
5. revalidate host WSL and the existing development environment.

No host boot, Hyper-V, WSL, VBS, Memory Integrity, firewall or reboot change was
made during discovery.

- `PHASE_7C = PARTIAL`
- `WINDOWS_IMPLEMENTATION = PASS`
- `WINDOWS_PHYSICAL_HOST_FUNCTIONAL = PASS`
- `WINDOWS_CURRENT_HOST_IDEMPOTENCY = PASS`
- `WINDOWS_CLEAN_HOST_QUALIFICATION = BLOCKED`
- `WINDOWS_PUBLIC_QUALIFICATION = NOT VERIFIED`
- `WINDOWS_REBOOT_SURVIVAL = NOT VERIFIED`
