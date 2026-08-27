# OJPLATFORM PHASE 0B.3R3 WSL PLATFORM RECOVERY REPORT

GOAL ID = `OJPLATFORM-0B3R3-WSL-PLATFORM-RECOVERY`
STARTING HEAD = `eb43009`
WINDOWS VERSION/BUILD = Windows 11 Home Chinese, build `26200`, x64
LATEST CU = NOT VERIFIED in this non-elevated session
WSL VERSION = `2.7.12.0`
WSL KERNEL = `6.1.18.3-2`
INITIAL WSL STATUS = TIMEOUT (>30s)
INITIAL WSL LIST = TIMEOUT (>30s)
INITIAL UBUNTU PROBE = TIMEOUT (>30s); interactive shell also did not respond

OPTIONAL FEATURES = NOT VERIFIED; `Get-WindowsOptionalFeature -Online` requires elevation
VIRTUALIZATION = systeminfo reports base virtualization support and Virtualization-based security running
HYPERVISOR CONFIG = bcdedit inspection not completed with usable output in this run
WSL SERVICE = `WslService` Running / Automatic
VMCOMPUTE = Running / Manual
HNS = Running / Manual

PROXY BASELINE = Windows Internet Settings `ProxyEnable=0`, `ProxyServer=127.0.0.1:10809`; WinHTTP direct; xray listener exists at `127.0.0.1:10809`.
PROXY-OFF RESULT = No system proxy was enabled at baseline; no proxy setting was changed. A full application-stop/restart isolation cycle was not performed because the WSL control plane was already hung and stopping the user's proxy process would risk leaving networking unavailable.
WSLCONFIG = No `%USERPROFILE%\\.wslconfig` file found.
WSLCONFIG-OFF RESULT = NOT APPLICABLE; no file to isolate or restore.

OFFICIAL WSL LOGS = Downloaded Microsoft's `collect-wsl-logs.ps1` to an external diagnostics directory, but execution was blocked by its mandatory `#Requires -RunAsAdministrator`; current PowerShell is not elevated.
DIAGNOSIS = WSL client/version reporting works, but status, distro enumeration, distro command launch, and shutdown hang. WSL Store package `MicrosoftCorporationII.WindowsSubsystemForLinux` `2.7.12.0` is installed. Recent Hyper-V vSwitch events show WSL networking ports being created successfully; no decisive WSL error was available without elevated official collection.
EVENT LOG FINDINGS = Recent Hyper-V-VmSwitch informational create/connect events; no actionable Lxss operational log was available.

RECOVERY ACTIONS = Read-only platform inventory and official diagnostic script acquisition. No Docker operation performed.
SERVICE RESTARTS = NONE; service control requires elevation and no unrelated workloads were assumed safe to interrupt.
WSL UPDATE/REPAIR = NOT RUN; installed WSL package is current `2.7.12.0`, and control-plane hang makes an update attempt non-diagnostic.
WINDOWS FEATURE REPAIR = NOT RUN; elevation unavailable and feature corruption not established.
REBOOT REQUIRED = Likely; WSL control plane remains hung. No reboot initiated by this session.

FOLLOW-UP RECHECK (2026-08-27) = Host last boot time remained `2026-08-26 22:49:27`; no reboot occurred between attempts. `wsl --version` returned normally, while `wsl --status`, `wsl --list --verbose`, `wsl -d Ubuntu-24.04 -- uname -a`, `wsl -d Ubuntu-24.04 -- echo WSL_OK`, and `wsl --shutdown` again exceeded the bounded 30-second limit. WslService/vmcompute/hns remained Running. This is a repeated WSL control-plane timeout, not evidence of recovery.

THIRD BOUNDED RECHECK (2026-08-27) = Host boot time remained `2026-08-26 22:49:27`. `wsl --version` completed, but `wsl --status`, `wsl --list --verbose`, `wsl -d Ubuntu-24.04 -- echo WSL_OK`, and `wsl -d Ubuntu-24.04 -- uname -a` again exceeded 30 seconds. The identical control-plane blocker has now repeated across three consecutive goal turns; Docker remains untouched.

FINAL WSL GATE CYCLE 1 = FAIL/BLOCKED: only `wsl --version` returned; status/list/Ubuntu probes exceeded 30s.
FINAL WSL GATE CYCLE 2 = NOT RUN; cycle 1 did not pass.
INTERACTIVE SHELL = FAIL/BLOCKED (>30s)
WSL SHUTDOWN = FAIL/BLOCKED (>30s in prior boundary test)
UBUNTU VERSION 2 = Registration was previously observed, but current list command is unavailable; NOT REQUALIFIED.

DOCKER TOUCHED = NO
0B.3R2 RESUME ALLOWED = NO

REPORT = THIS FILE
PROJECT_STATUS = UPDATED
COMMIT = PENDING
FINAL HEAD = PENDING
FINAL GIT STATUS = PENDING

KNOWN LIMITATIONS = Official WSL log collection and feature/service repair require an elevated PowerShell session. WSL command-plane timeouts persist after Docker Desktop removal. No Docker Engine installation, startup, image pull, or 0B.3 runtime qualification was attempted.
FOLLOW-UPS = Run this Goal from an elevated PowerShell after Windows/WSL recovery or reboot; execute official log collection while reproducing bounded hangs, then rerun both complete WSL acceptance cycles. Only after two stable PASS cycles may 0B.3R2 Docker Engine work resume.

PHASE 0B.3R3 FINAL STATUS = `BLOCKED`
