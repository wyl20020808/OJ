# OJPlatform

**语言 / Language:** [简体中文](./README.zh-CN.md) | [English](./README.en.md)

## 1. 项目简介

OJPlatform 是面向长期维护和安全演进的现代在线判题平台。项目采用模块化 API、
独立 Judge 控制面和 Linux 沙箱执行单元，并通过公开契约连接各模块。

## 2. 功能特性

- 账号验证、登录、Session、CSRF 与权限控制
- 题库、题目版本、提交、评测记录及逐测试点结果
- 比赛、作业、团队、讨论、个人资料等产品能力
- PostgreSQL、Redis ACL、MinIO 与 Docker Compose 生产控制面
- 可重试、幂等的 Judge 作业和结果链路
- 一键部署、只读诊断、数据持久化和重启恢复

## 3. 在线代码编辑器

OnlineCodeEditor 是固定到父仓库 gitlink 的独立公开子模块，基于 CodeMirror。
递归克隆会自动取得经过版本锁定的编辑器；部署脚本会拒绝构建漂移版本。

## 4. 判题系统

不可信代码只在 Ubuntu Linux 的非 root、rootless-runc 沙箱执行。Worker 不直接
访问产品 PostgreSQL。Supervisor 使用 namespaces、cgroup v2、只读 rootfs、网络
隔离和资源限制。Windows 不是新的 Judge 实现；Windows 部署仍在 WSL2 Ubuntu
内运行同一 Linux Judge。

## 5. 一键部署

正式支持的生产基线是 Ubuntu 24.04 LTS x86_64。Phase 7C 的 Windows 目标是
Windows 11 x86_64 + WSL2 Ubuntu 24.04；在独立全新 Windows 主机完成最终资格
验证前，不宣称 Windows 部署已经正式通过。

Linux ARM64、Windows ARM64、Windows Server 和原生 Windows Judge 尚未正式
验证。Windows 10 仅属尽力兼容，不宣称正式支持。

## 6. Windows 一键部署

已有 Git 和仓库：

```powershell
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1
```

脚本自动请求一次 UAC 管理员确认，检查 Windows/资源/虚拟化，安装 WSL2 和
Ubuntu 24.04，启用 systemd，在 WSL ext4 文件系统中克隆公开仓库，调用 Linux
`deploy/install.sh`，验证服务并配置最小化登录启动任务。需要重启时会安全登记
最多三次的自动恢复任务；成功后会清理临时任务和状态文件。

全新 Windows 没有 Git 时，先从仓库 Raw 页面下载并检查
`deploy/bootstrap-windows.ps1`，再执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap-windows.ps1
```

该脚本只使用 Windows Package Manager 的 `Git.Git` 包；没有 winget 时会要求从
Git 官方站点安装，不会下载未知二进制。Docker Desktop、Node、pnpm、Go 均非
前置条件。详见
[Windows 一键部署](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md)。

## 7. Linux 一键部署

```bash
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

Linux 安装器是 Docker、Compose、环境变量、Judge、健康检查和子模块验证的唯一
生产来源。详见
[Linux 一键部署](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)。

## 8. 系统要求

| 平台    | 最低要求                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------- |
| Windows | Windows 11 x86_64、虚拟化、WSL2、至少 4 GiB RAM、系统盘至少 25 GiB 可用空间                     |
| Linux   | Ubuntu 24.04 x86_64、systemd、cgroup v2、至少 2 CPU、4 GiB RAM、`/var/lib` 至少 15 GiB 可用空间 |
| 网络    | 可访问 GitHub、微软 WSL 来源、Docker 官方仓库和容器镜像仓库                                     |

## 9. 项目结构

```text
apps/                 Web、API、Judge Service、Worker、Supervisor
packages/             公共契约、Core、Judge Protocol、Plugin SDK
deploy/               Linux/Windows 生产安装器和诊断工具
plugins/               固定版本的 OnlineCodeEditor 子模块
scripts/               开发 Runtime Manager、迁移及资格验证脚本
Docs/                  架构、部署、目标、报告和历史状态
tests/                 单元、集成、架构、安全和部署契约测试
```

## 10. 开发环境

Windows 开发模式仍使用现有 `scripts/dev-runtime.ps1`，不会被生产 Windows
bootstrap 替代：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-runtime.ps1 start
powershell -ExecutionPolicy Bypass -File .\scripts\dev-runtime.ps1 status
powershell -ExecutionPolicy Bypass -File .\scripts\dev-runtime.ps1 stop
```

开发工具链见 [环境基线](./Docs/ENVIRONMENT_BASELINE.md) 和
[本地 Runtime Manager](./Docs/LOCAL_RUNTIME.md)。

## 11. 更新

Windows：在 Windows 仓库和 WSL 生产仓库分别快进更新后，重新运行
`deploy/install-windows.ps1`。脚本会复用现有 distro、`.env`、数据库和服务。

Linux：

```bash
git pull --ff-only
git submodule update --init --recursive
sudo ./deploy/install.sh
```

## 12. 部署诊断

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\doctor-windows.ps1
```

最后一行必须是 `WINDOWS_DEPLOY_DOCTOR=PASS`。

Linux：

```bash
sudo ./deploy/doctor.sh
```

最后一行必须是 `DEPLOY_DOCTOR=PASS`。诊断工具不会显示 secret。

## 13. 常见问题

- **需要 Docker Desktop 吗？** 不需要。Docker Engine 由 Linux 安装器安装在 WSL2
  Ubuntu 内。
- **需要查 WSL IP 吗？** 不需要。默认从 Windows 访问
  `http://localhost:8080/`；仅当 localhost forwarding 异常时诊断工具才报告故障。
- **为什么代码不在 `/mnt/c`？** 生产 checkout 位于 WSL ext4，避免 NTFS 权限、
  executable bit 和 Docker build context 问题。
- **会关闭 Windows Firewall 吗？** 不会。默认只依赖 localhost forwarding，
  不创建公网或 LAN 入站规则。
- **重启后为什么能恢复？** systemd 服务和 Compose restart policy 会恢复 Linux
  服务；最小化 Windows 登录任务负责启动 WSL distro，不保存凭据。
- **如何查看详细失败原因？** Windows 日志位于
  `%ProgramData%\OJPlatform\install-windows.log`。

## 14. 文档索引

- [架构基线](./Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
- [Windows 部署](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md)
- [Linux 一键部署](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)
- [Judge 生产部署](./Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md)
- [Judge Docker 架构](./Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md)
- [当前交接](./Docs/OJPLATFORM_CURRENT_HANDOFF.md)
- [历史状态](./Docs/PROJECT_STATUS.md)

## 15. License / Contributing

贡献前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)、[AGENTS.md](./AGENTS.md)
和 [SECURITY.md](./SECURITY.md)。仓库当前没有独立 LICENSE 文件；未经许可请勿
假定可以复制或再发布项目代码。
