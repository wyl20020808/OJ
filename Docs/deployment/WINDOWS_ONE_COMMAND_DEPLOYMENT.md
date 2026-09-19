# Windows One-Command Production Bootstrap

[简体中文](../../README.zh-CN.md) | [English](../../README.en.md)

## Support contract

Phase 7C supports **Windows 11 x86_64** as a bootstrap host for the existing
Ubuntu 24.04 production runtime under WSL2. It does not create a Windows-native
runtime, Judge, database stack, systemd replacement, Compose topology, or second
orchestrator.

`deploy/install.sh` remains authoritative for Docker Engine, Compose, generated
production configuration, submodule validation, service health, and Judge host
provisioning. Docker Desktop is not required.

| Platform | Status |
| --- | --- |
| Windows 11 x86_64 + WSL2 Ubuntu 24.04 | Supported target; requires Phase 7C clean-host qualification evidence before PASS is claimed |
| Windows 10 x86_64 | Best effort only; not formally qualified |
| Windows ARM64 | Not supported |
| Windows Server | Not qualified |
| Native Windows Judge | Not a target |

## Entry points

### Existing checkout

```powershell
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1
```

### Fresh Windows without Git

Download and inspect `deploy/bootstrap-windows.ps1` from the public repository's
Raw view, then run it locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap-windows.ps1
```

The bootstrap uses `winget install --id Git.Git --exact --scope user`. If
winget is absent, it stops and points to `https://git-scm.com/download/win`.
It never uses Chocolatey or an unofficial binary source.

An `irm ... | iex` pipeline is deliberately not the primary recommendation:
users should have an opportunity to inspect the downloaded script.

## Installation stages

1. Validate Windows 11 build, x86_64, memory, disk, virtualization, WSL status,
   distro status, and pending reboot state.
2. Request Administrator elevation through `RunAs` if needed. Script path,
   repository path, and validated arguments are retained. UAC is the only
   expected elevation interaction.
3. Install current Microsoft WSL support and the distro name advertised as
   `Ubuntu-24.04`, using `wsl.exe --install ... --version 2 --no-launch`.
4. When a reboot is required, save only safe state under
   `%ProgramData%\OJPlatform`, register `OJPlatform-Phase7C-Resume` for the
   current user at sign-in, and resume automatically. After three failed resume
   attempts the task removes itself and fails closed. No password, token,
   secret, or Linux configuration value enters the state or task.
5. Start the distro as root so Ubuntu's interactive UNIX username prompt is not
   required. Create the dedicated unprivileged `ojplatform` account without a
   password. Windows credentials are never passed into Linux.
6. Enable `[boot] systemd=true` in `/etc/wsl.conf`, shut WSL down only when the
   setting changes, restart it, and verify systemd as PID 1.
7. Clone the public repository recursively to `/home/ojplatform/OJ` on the WSL
   ext4 filesystem and verify the OnlineCodeEditor gitlink. Production does not
   execute from `/mnt/c`: this avoids NTFS permission, executable-bit, and
   Docker build-context problems.
8. Invoke `./deploy/install.sh --non-interactive` as WSL root. No permanent
   `NOPASSWD:ALL` rule or Linux password is created.
9. Run `deploy/doctor.sh`, verify Web and API through Windows localhost, then
   register the idempotent `OJPlatform-WSL-Startup` sign-in task.
10. Remove the temporary resume task and state file and print the final access
    URL.

Detailed output is written to
`%ProgramData%\OJPlatform\install-windows.log`; secret values and full Linux
commands are not logged.

## Reboot behavior

Enabling WSL or VirtualMachinePlatform can require a Windows reboot. The default
flow registers bounded resume first, then schedules restart with a 30-second
Windows countdown. `shutdown /a` postpones it. Use `-NoReboot` to prevent the
script from initiating restart; the registered task still resumes after the
operator restarts and signs in.

The persistent `OJPlatform-WSL-Startup` task contains only the distro name and a
stable local startup script. It runs with the current interactive user, starts
the distro, and waits for the Web endpoint. It stores no credential and creates
no duplicate task on installer reruns.

WSL distributions are per Windows user. A SYSTEM startup task would start a
different WSL registration context, so Phase 7C intentionally uses an at-logon
user task rather than pretending that SYSTEM can restore the user's distro.

## Network and firewall

The supported URL is:

```text
http://localhost:8080/
```

WSL2 localhost forwarding is preferred and verified with
`Invoke-WebRequest`. The installer does not disable Windows Firewall, add an
inbound rule, create a `netsh portproxy`, or expose Product DB, Redis, MinIO,
Judge Service, Worker, or Supervisor ports. LAN access is outside the default
scope and must be configured explicitly by an operator.

If localhost forwarding fails, run the Windows doctor. A WSL IP can be obtained
for diagnosis, but users are not expected to discover or persist it.

## Idempotency

Re-running `deploy/install-windows.ps1`:

- reuses the existing WSL installation and `Ubuntu-24.04` distro;
- confirms WSL2 and systemd instead of recreating them;
- reuses `/home/ojplatform/OJ` after verifying the official origin;
- reuses the Linux `.env`, secrets, volumes, database, rootfs, and services;
- updates the single startup task in place;
- never duplicates resume tasks or clones to a new path;
- delegates convergence to the idempotent Linux installer.

It does not automatically `git pull` an existing production checkout. Updates
remain an explicit operator action.

## Update

From Windows, update the outer checkout containing the PowerShell entry point:

```powershell
git pull --ff-only
git submodule update --init --recursive
```

Update the production checkout and rerun the bootstrap:

```powershell
wsl.exe -d Ubuntu-24.04 -u root --exec bash -lc \
  "cd /home/ojplatform/OJ && git pull --ff-only && git submodule update --init --recursive"
powershell -ExecutionPolicy Bypass -File .\deploy\install-windows.ps1
```

## Read-only diagnosis

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\doctor-windows.ps1
```

It checks Windows build/architecture, WSL version, distro version, systemd, WSL
disk, the Linux doctor, Docker/services/Judge through that doctor, Windows
localhost Web/API access, and the startup task. The final line is exactly one
of:

```text
WINDOWS_DEPLOY_DOCTOR=PASS
WINDOWS_DEPLOY_DOCTOR=FAIL (N finding(s))
```

## Troubleshooting

- **Virtualization unavailable:** enable CPU virtualization in firmware. The
  installer fails before changing WSL.
- **Distro unavailable online:** run `wsl --list --online`; Phase 7C refuses to
  guess or silently install another Ubuntu release.
- **Resume limit reached:** inspect the ProgramData log, fix the reported WSL or
  Windows issue, then rerun the same installer. Automatic login retries have
  already been disabled.
- **Linux preflight failure:** ensure WSL has at least 2 virtual CPUs, 4 GiB RAM,
  and 15 GiB free under `/var/lib`. `.wslconfig` resource restrictions can make
  the Linux production gate fail closed.
- **localhost unavailable:** run `doctor-windows.ps1`, then `wsl --shutdown` and
  rerun the installer. Do not add firewall or portproxy rules before diagnosis.
- **Detailed logs:** `%ProgramData%\OJPlatform\install-windows.log`.

## Security notes

- Resume state contains paths, stage, attempt count, distro, and account names
  only.
- No Linux or Windows password is created, copied, or persisted.
- No permanent sudo exemption is installed.
- No firewall is disabled and no internal service is published.
- The WSL checkout verifies the official HTTPS origin and pinned submodule.
- Untrusted submissions continue to execute only in the qualified Linux sandbox
  boundary.
