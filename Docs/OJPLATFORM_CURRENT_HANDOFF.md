# OJPlatform Current Handoff

> HOT STATE only. Live Git/code wins. Git hashes below are last-known state.
> Read history only when this file is insufficient.

## Startup Rule

1. Run live Git branch/HEAD/main/status checks.
2. Read this file.
3. Do not preload `Docs/PROJECT_STATUS.md` or historical reports.
4. Keep this file at 60–100 lines; hard ceiling 120.

## Phase Definitions

`Phase 7 = Fresh-Machine Deployment & Bootstrap`.  
`Phase 7A = Standard Docker Compose Deployment + Linux Host Provisioning`.  
`Phase 7B = Production Publication + One-Command Fresh Host Deployment`.  
`Phase 7C = Windows Foolproof One-Command Deployment + Bilingual README`.

## Completed Baseline

- Docker Phase 0 audit: DONE (original verdict PARTIAL); Phase 1–4: PASS / MERGED.
- Docker Phase 6A + 6B-1 … 6B-6: PASS / MERGED.
- Linux amd64 Judge + Production Judge: QUALIFIED / MERGED.
- Phase 7A: PASS / MERGED.
- Phase 7B: PASS / MERGED / PUBLISHED / PUBLICLY QUALIFIED.

## Active / Deferred

```text
Phase 5 cross-platform ............... PARTIAL
  Windows/WSL2 amd64 Docker ......... PASS
  Mac Intel / Apple Silicon ......... DEFERRED (no real Mac)
  Native ARM64 full Judge ........... NOT QUALIFIED
Phase 7C Windows deployment ......... PARTIAL / FEATURE BRANCH
  PowerShell bootstrap/doctor ........ IMPLEMENTED / FUNCTIONALLY TESTED
  Physical Windows host .............. FUNCTIONAL PASS / IDEMPOTENCY PASS
  Bilingual README ................... IMPLEMENTED
  Clean Windows runtime .............. BLOCKED (no nested Windows host)
  Integration/publication ............ PENDING clean-host qualification
```

## Phase 7C Facts

- Feature branch: `codex/phase7c-windows-one-command-deployment-v1`.
- Base: public `main` `d785b36aab5306c31f774344394e87899a74c981`.
- Implementation commits: `8a0ee5a`, `6546ddd`, `e07bc6c`, `fef3335`.
- Windows is bootstrap only and delegates to authoritative `deploy/install.sh`;
  no second orchestrator or Windows-native Judge/DB/systemd architecture exists.
- Implemented `deploy/install-windows.ps1`, `bootstrap-windows.ps1`,
  `doctor-windows.ps1`, secret-free bounded reboot resume, systemd setup, WSL
  ext4 public clone, localhost checks, and credential-free WSL startup task.
- `README.md` routes prominently to full `README.zh-CN.md` and `README.en.md`.
- Package and Git progress now stream live with bounded apt retries/timeouts;
  existing distros use WSL root free space; WSL warnings cannot corrupt numeric
  parsing; Docker image builds support an explicit npm registry override.
- Web dynamically re-resolves Docker API DNS across idempotent container
  recreation.
- PowerShell parser, 52 deployment contracts, typecheck, build, architecture,
  changed lint/format and diff gates pass.
- Full Vitest still has unrelated pre-existing Web contract failures; Phase 7C
  tests pass.

## Current-Host Qualification

- Dedicated isolated WSL2 distro `OJPlatform-Phase7C-Functional`: Ubuntu
  24.04.5, systemd PID 1, ext4 VHDX on `D:`. Existing distros were untouched.
- Full installer and second installation completed. Persistence retained repo,
  plugin, environment, and volume fingerprints.
- Linux and Windows doctors PASS; localhost Web/API return 200; startup task is
  registered.
- Real verified registration/session/CSRF/problem/Judge-data/submission flow
  produced post-second-install AC/WA/TLE/MLE/CE/RE. Windows Edge CodeMirror
  selectors and keyboard input passed with zero uncaught page errors.
- Rejudge is NOT VERIFIED: Judge Service returned 409 and API surfaced 503.
  Cancel was not exercised. Temporary mail qualification infrastructure was
  removed and production configuration restored.

## Hard Blocker

- Local hypervisor inventory was re-audited: VMware Workstation 17.6.4 exists;
  VirtualBox/QEMU do not; full Hyper-V management/module is absent on Windows
  Home. The active Microsoft hypervisor supports WSL utility VMs only.
- Four local VMware VMs exist; all are stopped Ubuntu x86_64 guests with
  `vhv.enable=FALSE`. No Windows VM or Windows snapshot exists to clone.
- Host VBS and Microsoft hypervisor are active. VMware rejects nested VT-x/EPT
  in this mode, so a new Windows guest cannot run WSL2.
- Only remaining local route is a reversible host-hypervisor switch requiring
  two host reboots and temporary WSL/Docker interruption. Explicit approval is
  required; no host setting was changed.
- Physical-host evidence is functional only. Do not merge/publish or claim
  clean/public Windows PASS before clean-host runtime evidence.

## Next Action

1. If approved, record host boot state, disable Microsoft hypervisor boot,
   reboot, qualify a disposable nested VMware Windows 11 guest, restore the
   exact host setting, reboot, and revalidate host WSL.
2. Run clean no-Git bootstrap, reboot/resume, auth/CSRF, Judge/browser, second
   install, guest reboot, persistence, and doctor gates.
3. After clean-host PASS, integrate from fresh live `main` with `--no-ff`, run
   regression, push only `main`, and repeat from the public clone.

## Critical Boundaries

- Untrusted code never runs in Windows, API/Web/Core/Judge Service/Plugin Host.
- `deploy/install.sh` remains the single production installer.
- Do not disable Windows Firewall, require Docker Desktop, persist credentials,
  leave `NOPASSWD:ALL`, deploy from `/mnt/c`, or expose internal service ports.
- Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
  remains DEFERRED.

## References

- Phase 7C report:
  `Docs/reports/OJPLATFORM_PHASE7C_WINDOWS_ONE_COMMAND_DEPLOYMENT_V1_REPORT.md`.
- Windows deployment: `Docs/deployment/WINDOWS_ONE_COMMAND_DEPLOYMENT.md`.
- Linux deployment: `Docs/deployment/ONE_COMMAND_DEPLOYMENT.md`.

Last Updated: 2026-09-20 (Phase 7C physical-host functional PASS; clean Windows qualification blocked)
