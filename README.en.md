# OJPlatform

**语言 / Language:** [简体中文](./README.zh-CN.md) | [English](./README.en.md)

## 1. Overview

OJPlatform is a modern Online Judge designed for long-term maintenance and safe
evolution. It uses a modular API, a separate Judge control plane, and a Linux
sandbox execution cell connected through explicit public contracts.

## 2. Features

- Verified identities, password login, sessions, CSRF, and authorization
- Problems, immutable revisions, submissions, evaluations, and testcase results
- Contests, assignments, teams, discussions, and profiles
- PostgreSQL, Redis ACLs, MinIO, and a Docker Compose production control plane
- Retry-safe, idempotent Judge jobs and result publication
- One-command deployment, read-only diagnostics, persistence, and reboot recovery

## 3. OnlineCodeEditor

OnlineCodeEditor is an independent public Git submodule pinned by the parent
repository gitlink and built with CodeMirror. Recursive clones acquire the exact
version; production deployment rejects submodule drift.

## 4. Judge architecture

Untrusted code runs only inside the Ubuntu Linux non-root rootless-runc sandbox.
Workers never access Product PostgreSQL directly. Supervisor isolation includes
namespaces, cgroup v2, a read-only rootfs, network isolation, and resource
limits. Windows does not introduce a native Judge: Windows deployment runs the
same Linux Judge inside WSL2 Ubuntu.

## 5. One-command deployment

The qualified production baseline is Ubuntu 24.04 LTS x86_64. Phase 7C targets
Windows 11 x86_64 with WSL2 Ubuntu 24.04, but Windows deployment is not claimed
as qualified until an independent clean Windows host completes the final gate.

Linux ARM64, Windows ARM64, Windows Server, and a native Windows Judge are not
qualified. Windows 10 is best effort only and is not claimed as supported.

## 6. Windows deployment

With Git and a checkout:

```powershell
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1
```

The script requests one UAC confirmation, validates Windows and virtualization,
installs WSL2 and Ubuntu 24.04, enables systemd, clones the public repository
into the WSL ext4 filesystem, invokes the authoritative Linux installer,
validates services, and registers a minimal sign-in startup task. If Windows
must reboot, a bounded resume task continues after sign-in and removes its state
on success.

For a fresh Windows host without Git, download and inspect
`deploy/bootstrap-windows.ps1` from the repository's Raw view, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap-windows.ps1
```

It uses only the official Windows Package Manager `Git.Git` package. If winget
is absent, it fails with the official Git download URL instead of fetching an
untrusted binary. Docker Desktop, Node, pnpm, and Go are not prerequisites.
See the [Windows deployment guide](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md).

## 7. Linux deployment

```bash
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

`deploy/install.sh` remains the single production source of truth for Docker,
Compose, environment generation, Judge provisioning, health checks, and
submodule validation. See the
[Linux deployment guide](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md).

## 8. Requirements

| Platform | Minimum                                                                               |
| -------- | ------------------------------------------------------------------------------------- |
| Windows  | Windows 11 x86_64, virtualization, WSL2, 4 GiB RAM, 25 GiB free on the system drive   |
| Linux    | Ubuntu 24.04 x86_64, systemd, cgroup v2, 2 CPUs, 4 GiB RAM, 15 GiB free on `/var/lib` |
| Network  | GitHub, Microsoft WSL sources, Docker's official repository, and container registries |

## 9. Repository layout

```text
apps/                 Web, API, Judge Service, Worker, Supervisor
packages/             Contracts, Core, Judge Protocol, Plugin SDK
deploy/               Linux and Windows production installers and doctors
plugins/               Pinned OnlineCodeEditor submodule
scripts/               Development Runtime Manager, migrations, qualification
Docs/                  Architecture, deployment, goals, reports, history
tests/                 Unit, integration, architecture, security, contracts
```

## 10. Development

The existing Windows development workflow remains separate from production
bootstrap:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-runtime.ps1 start
powershell -ExecutionPolicy Bypass -File .\scripts\dev-runtime.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\dev-runtime.ps1 stop
```

See [Environment Baseline](./Docs/ENVIRONMENT_BASELINE.md) and
[Local Runtime Manager](./Docs/LOCAL_RUNTIME.md).

## 11. Updating

On Windows, fast-forward both the outer Windows checkout and the WSL production
checkout, then rerun `deploy/install-windows.ps1`. Existing WSL distribution,
`.env`, databases, and services are reused.

On Linux:

```bash
git pull --ff-only
git submodule update --init --recursive
sudo ./deploy/install.sh
```

## 12. Diagnostics

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\doctor-windows.ps1
```

The final line must be `WINDOWS_DEPLOY_DOCTOR=PASS`.

Linux:

```bash
sudo ./deploy/doctor.sh
```

The final line must be `DEPLOY_DOCTOR=PASS`. Doctors never print secret values.

## 13. FAQ

- **Is Docker Desktop required?** No. The Linux installer installs Docker Engine
  inside WSL2 Ubuntu.
- **Must users find the WSL IP?** No. Use `http://localhost:8080/`; Windows
  localhost forwarding is checked automatically.
- **Why not deploy from `/mnt/c`?** The production checkout lives on WSL ext4 to
  avoid NTFS permissions, executable-bit, and Docker build-context problems.
- **Does the installer disable Windows Firewall?** No. It creates no inbound
  firewall rule and exposes no Judge or database port.
- **How does reboot recovery work?** Enabled systemd units and Compose restart
  policies restore Linux services. A credential-free sign-in task starts the
  WSL distribution.
- **Where are detailed Windows logs?**
  `%ProgramData%\OJPlatform\install-windows.log`.

## 14. Documentation index

- [Architecture baseline](./Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
- [Windows deployment](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md)
- [Linux one-command deployment](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)
- [Production Judge runbook](./Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md)
- [Judge Docker architecture](./Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md)
- [Current handoff](./Docs/OJPLATFORM_CURRENT_HANDOFF.md)
- [Historical status](./Docs/PROJECT_STATUS.md)

## 15. License and contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md), [AGENTS.md](./AGENTS.md), and
[SECURITY.md](./SECURITY.md) before contributing. This repository currently has
no standalone LICENSE file; do not assume redistribution rights without
permission.
