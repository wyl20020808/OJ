# OJPlatform

**语言 / Language：** [简体中文](./README.md) | [English](./README.en.md) | [完整中文文档](./README.zh-CN.md)

OJPlatform 是面向长期维护的现代在线判题平台：题库与题目版本、在线代码编辑、
提交与真实 AC/WA 判题、用户与权限、比赛/作业/团队/讨论，以及 Linux 与
Windows 一键生产部署。

## 功能特性

- **在线题目**：题目列表与详情、题目版本、样例、提示与公共题号等元信息
- **OnlineCodeEditor / CodeMirror**：题目内嵌编辑器，版本固定的独立子模块
- **提交与评测**：`cpp20` 生产判题语言，评测记录与逐测试点结果、评测实时事件
- **Judge 判题系统**：独立 Judge Service 控制面，不可信代码只在 Ubuntu Linux
  的非 root、rootless-runc 沙箱内执行
- **资源限制**：时间、内存、输出与并发限制，namespaces、cgroup v2、只读 rootfs
- **用户认证**：注册、密码登录、会话、CSRF 保护、访客模式、角色与权限
- **管理能力**：题目与判题数据管理（草稿、校验、发布、不可变版本）、Judge 节点
  与沙箱运维、只读诊断工具
- **生产部署**：Docker Compose 生产编排、一键安装、幂等重装、数据持久化与重启恢复

## 快速开始

### Ubuntu 24.04 x86_64 / Linux —— Production Qualified

```bash
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

安装器检查主机、按需安装 Docker、初始化固定版本的 OnlineCodeEditor 子模块、
生成一次生产密钥、启动生产 Compose 编排、等待真实健康检查，并随后配置宿主机
原生 Judge 执行单元。宿主机不需要 Node、pnpm 或 Go。

手工 / 高级路径同样受支持（详见
[手工部署路径](./Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md)）：

```bash
docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build
sudo ./deploy/judge-host/install.sh
```

### Windows 11 x86_64 —— Preview / 功能资格验证通过

```powershell
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1
```

Windows 只作为引导主机，生产运行时仍然是 WSL2 内的 Ubuntu 24.04，并复用同一个
权威 Linux 安装器。

#### Windows 说明

- 使用 **WSL2 + Ubuntu 24.04**；**不使用 Windows 原生 Judge**
- **Docker Desktop 不是项目要求**：Docker Engine 由 Linux 安装器安装在 WSL2 内
- Windows 部署状态为 **Preview**：已在具备现有 WSL2 的 Windows 11 x86_64 物理主机
  完成功能资格验证（安装、Web、API、数据库、Judge AC/WA/TLE/MLE/CE/RE、编辑器、
  双次安装幂等、持久化、诊断）
- **全新 Windows 主机（无 WSL2）的自动安装与重启续跑，其最终独立资格验证尚待完成**
- 未验证平台：Windows ARM64、Windows Server、Windows 10（仅尽力兼容）
- 无需 Docker Desktop、Node、pnpm、Go；不会关闭 Windows 防火墙，也不会创建公网
  或局域网入站规则

## 我想……

- [在 Ubuntu / Linux 上部署](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)
- [在 Windows 上部署（WSL2）](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md)
- [查看判题系统架构](./Docs/deployment/JUDGE_DOCKER_ARCHITECTURE.md)
- [查看 OnlineCodeEditor](https://github.com/wyl20020808/OnlineEditor)
- [本地开发 Runtime](./Docs/LOCAL_RUNTIME.md)
- [部署故障排查](#部署诊断)
- [查看完整中文文档](./README.zh-CN.md) · [English guide](./README.en.md)

## 部署状态

| 平台                        | 状态                           |
| --------------------------- | ------------------------------ |
| Ubuntu 24.04 x86_64 / Linux | Production Qualified           |
| Windows 11 x86_64 + WSL2    | Preview / Functional Qualified |
| Windows ARM64               | Not Qualified                  |
| macOS                       | Not Target                     |

- **Production Qualified**：可在一台全新 Ubuntu 24.04 主机上重复完成一键安装与
  真实提交判题验证。
- **Preview / Functional Qualified**：功能路径在真实 Windows 11 物理主机上通过
  验证；全新主机引导与重启恢复仍待独立资格验证，不作为生产承诺。

## 部署诊断

```bash
sudo ./deploy/doctor.sh            # 末尾输出 DEPLOY_DOCTOR=PASS
```

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\doctor-windows.ps1
# 末尾输出 WINDOWS_DEPLOY_DOCTOR=PASS
```

诊断工具只读，不会输出任何密钥。

## 文档

- [完整中文文档](./README.zh-CN.md) · [Complete English guide](./README.en.md)
- [架构基线](./Docs/OJ_PROJECT_ARCHITECTURE_BASELINE_V1.md)
- [Linux 一键部署](./Docs/deployment/ONE_COMMAND_DEPLOYMENT.md)
- [Windows 一键部署](./Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md)
- [手工部署路径](./Docs/deployment/FRESH_MACHINE_DEPLOYMENT.md)
- [Judge 生产部署](./Docs/deployment/JUDGE_PRODUCTION_DEPLOYMENT.md)
- [当前交接](./Docs/OJPLATFORM_CURRENT_HANDOFF.md)
- [贡献指南](./CONTRIBUTING.md) · [安全策略](./SECURITY.md)
