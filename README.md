# OJPlatform

**语言 / Language:** [简体中文](./README.zh-CN.md) | [English](./README.en.md)

OJPlatform 是面向长期演进的现代在线判题平台。它提供完整 Web 产品、独立
OnlineCodeEditor，以及隔离的 Linux Judge 执行边界。

OJPlatform is a modern Online Judge built for long-term evolution, a complete
Web experience, an independent OnlineCodeEditor, and isolated Linux judging.

## Quick Start / 快速开始

### Windows 11 x86_64

```powershell
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1
```

Windows is the bootstrap host. Production runs in Ubuntu 24.04 under WSL2 and
uses the same authoritative Linux installer. Docker Desktop, Node, pnpm, and Go
are not required.

Windows 仅作为引导主机；生产运行时仍是 WSL2 内的 Ubuntu 24.04，并复用权威
Linux 安装器。无需 Docker Desktop、Node、pnpm 或 Go。

### Ubuntu 24.04 x86_64

```bash
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

## Highlights / 核心能力

- Production Auth, Session, CSRF, problems, submissions, and evaluation flows
- Real AC/WA judging through a separate Worker/Supervisor/rootless-runc boundary
- Pinned independent OnlineCodeEditor submodule with CodeMirror
- Idempotent deployment, read-only doctors, reboot recovery, persistent data
- PostgreSQL, Redis ACL, MinIO, Docker Compose control plane

## Documentation / 文档

- [完整中文说明](./README.zh-CN.md)
- [Complete English guide](./README.en.md)
- [Windows one-command deployment](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md)
- [Linux one-command deployment](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)
- [Fresh-machine manual path](./Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md):
  `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
  then `sudo ./deploy/judge-host/install.sh`
- [Architecture baseline](./Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
- [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md)
