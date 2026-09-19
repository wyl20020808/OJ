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
Implementation commits: `8a0ee5a`, `6546ddd`

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
- `tests/windows-production-install-contract.test.ts`: 11 contract tests for
  architecture, support boundaries, elevation, official WSL/Git acquisition,
  bounded resume, credential handling, systemd, ext4 checkout, localhost,
  doctor behavior, and bilingual navigation.

Existing Windows development workflow `scripts/dev-runtime.ps1` is untouched.
The Linux installer and Compose architecture are untouched.

## Validation executed

| Gate | Result |
| --- | --- |
| PowerShell 5.1 parser, all three new scripts | PASS |
| Phase 7C + Phase 7B deployment contract tests | PASS, 50/50 |
| TypeScript typecheck | PASS |
| Production TypeScript build | PASS |
| Architecture dependency gate | PASS |
| Changed test ESLint | PASS |
| Changed Markdown/test Prettier | PASS |
| Git diff whitespace check | PASS |
| Full repository Vitest | Existing baseline failures: 82 files passed, 15 failed, 1 skipped; 995 tests passed, 47 failed, 10 skipped. Failures are unrelated existing Web contracts; no Phase 7C test failed. |

No secret, password, token, VM image, ISO, generated qualification state, or
machine-specific qualification artifact is tracked.

## Clean Windows qualification blocker

Final PASS requires a disposable clean Windows 11 x86_64 host with nested
virtualization, no repository, no WSL distro, no Node/pnpm/Go, no Docker
Desktop requirement, and preferably no Git.

Three reasonable acquisition paths were exhausted:

1. **Existing disposable inventory:** all available project VMs are Ubuntu;
   there is no Windows base image or clean Windows snapshot to clone.
2. **New official Windows VM:** the current official Windows 11 Enterprise
   Evaluation x64 ISO was acquired and a new disposable VMware VM definition
   was created. VMware starts the VM only after rejecting nested virtualization
   with `This platform does not support virtualized Intel VT-x/EPT`. Without
   nested virtualization the guest cannot run WSL2, so continuing would produce
   false evidence.
3. **Alternative local/cloud hypervisor:** the host is Windows Home and has no
   Hyper-V VM management capability; no external nested-virtualization Windows
   host or cloud credential is available. Windows Sandbox also cannot survive
   the required reboot/idempotency loop and is not valid qualification.

The host currently runs Hyper-V/WSL, which prevents VMware from exposing nested
VT-x. Disabling the host hypervisor may allow the VMware path but requires two
real host reboots, temporarily disables the user's WSL environment, and is not
safe to perform without explicit operator approval.

## Not verified

- Clean Windows first installation, duration, reboot count, UAC count, automatic
  resume, and fresh no-Git bootstrap.
- Real Windows reboot recovery and startup task.
- Windows second-install idempotency and persistence fingerprint.
- Production Auth/Session/CSRF, AC/WA/TLE/MLE/cancel/CE/RE, and Windows browser
  CodeMirror smoke against the Phase 7C deployment.
- Integration into `main` and public publication. No unqualified Windows claim
  has been merged or pushed.

## Required next action

Provide one of:

1. a disposable clean Windows 11 x86_64 machine/VM with nested virtualization
   and remote access; or
2. explicit approval to disable the current host hypervisor, reboot, run the
   nested VMware qualification, restore the hypervisor, and reboot again.

Then execute first install, real Auth/Judge/browser gates, second install,
Windows reboot survival, security audit, fresh no-ff integration, regression,
main-only publication, and a final public-clone clean-host repeat.

`PHASE_7C = PARTIAL`  
`WINDOWS_IMPLEMENTATION = PASS`  
`WINDOWS_RUNTIME_QUALIFICATION = BLOCKED`  
`WINDOWS_DEPLOYMENT_IDEMPOTENCY = NOT VERIFIED`  
`WINDOWS_REBOOT_SURVIVAL = NOT VERIFIED`
