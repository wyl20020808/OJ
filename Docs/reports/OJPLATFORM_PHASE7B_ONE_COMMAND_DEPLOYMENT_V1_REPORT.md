# Phase 7B One-Command Production Deployment V1 Report

Date: 2026-09-19  
Status: **PASS / MERGED / PUBLISHED / PUBLICLY QUALIFIED**

## Result

Phase 7B completed the public one-command production deployment path:

```bash
git clone --recurse-submodules https://github.com/wyl20020808/OJ.git
cd OJ
sudo ./deploy/install.sh
```

The qualified and initially published code tip is
`ff8f030cb4592038cdcefc014cb97f5fc2944d52`; the pinned OnlineCodeEditor
submodule is `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`. An anonymous recursive
clone reproduced both commits before this final documentation-only record.

## Delivered

- `deploy/install.sh`: fail-closed Linux amd64 preflight, official Docker
  bootstrap when required, pinned recursive submodule acquisition, one-time
  0600 production environment generation, port ownership checks, production
  Compose build/start, bounded health validation, and Judge host provisioning.
- `deploy/doctor.sh`: read-only host, repository, configuration-presence,
  service, execution-cell, endpoint, storage and listener diagnosis ending in
  `DEPLOY_DOCTOR=PASS` or `DEPLOY_DOCTOR=FAIL`.
- Host build minimization: Worker, trusted probe and Supervisor are built in a
  pinned Go builder container; Go and pnpm are not host prerequisites. The
  Node-based Host Agent is explicitly optional.
- Production auth correction: verified register/login now issues the CSRF
  cookie required by same-origin browser mutation requests; international phone
  password login uses general phone normalization.
- Contract tests and one-command deployment documentation.

Feature history was integrated from the latest live `main` with `--no-ff` and
without squashing. Integration tip and published `main` are `ff8f030`.

## Qualification

### First disposable Ubuntu host

A production deployment on Ubuntu 24.04 passed:

- real email challenge creation, captured disposable delivery, verification,
  verified registration, password login, authenticated `/api/auth/me`, session
  cookie and CSRF cookie;
- same-origin browser Submission API through the real Product DB, queue,
  Judge Service, native Worker, Supervisor and rootless-runc sandbox;
- AC `17fe3697-261f-47e0-9431-7d4b34f2fb7c` and WA
  `708c9b11-f15a-43e2-977d-41acac3ae951`;
- real CodeMirror editor DOM, keyboard input and zero fatal browser errors;
- reboot/reconnect, `deploy/doctor.sh`, retained repository/submodule/database,
  services and submissions;
- second installer run with preserved `.env`, secrets and data, no duplicate
  containers, followed by AC `f05410e3-b782-425a-9d2d-1320a32d239a` and WA
  `864b8199-8c33-4b64-a4a7-08f59f607bf1`.

### Clean public-clone Ubuntu host

A separate clean Ubuntu 24.04.5 VMware guest cloned only the public GitHub
repository recursively and ran `sudo ./deploy/install.sh` successfully. Its
qualification passed:

- public source and pinned plugin acquisition;
- production control plane and native Judge execution cell;
- real verified email registration/login, browser session and CSRF;
- production AC `78b64c1b-0e0c-444a-ad1b-0aa03978bbfc` and WA
  `df7fca59-0acf-43ec-ac3b-84e073c441df`;
- a real public problem and immutable Judge data created through public APIs,
  not direct database mutation;
- CodeMirror keyboard smoke with zero fatal browser errors;
- `DEPLOY_DOCTOR=PASS` before and after reboot;
- automatic reboot recovery with both submissions and all persistent state
  retained (`FINAL_REBOOT_SURVIVAL=PASS`);
- second `sudo ./deploy/install.sh` reusing the existing 0600 `.env`, retaining
  the pinned submodule and database records, reconciling healthy services and
  creating no duplicate containers (`FINAL_IDEMPOTENCY=PASS`);
- post-second-install real authenticated AC
  `8ff19d87-9802-4e65-a760-f74f97ba14be` (and negative-control WA
  `fdcb48ca-aa78-47a8-9c29-080409a16413`).

The disposable HTTP mail sink was used only to receive the production-generated
verification message. The code was submitted to the real verification endpoint;
no JWT, credential row, submission row or verdict was forged. The sink and its
Compose override were removed. Qualification-only passwordless sudo entries
were removed from both disposable guests.

## Validation and audit

- TypeScript typecheck, production build and architecture gate: PASS.
- Phase 7B changed-file lint/format and `git diff --check`: PASS.
- Deployment contracts, Judge configuration qualification, OnlineCodeEditor
  typecheck/tests/build, shell syntax and shellcheck: PASS.
- Production browser/auth/Judge, reboot and installer-idempotency gates: PASS on
  both the qualification host and the independent public-clone host.
- Gitleaks scanned all reachable history. Eight generic-key candidates were
  reviewed as test markers, commit hashes or configuration names; real secrets:
  none.
- No credential files, production dumps, VM images, suspicious large blobs on
  `main`, or required machine-specific absolute paths were published.
- A broad repository test/lint invocation exposed pre-existing unrelated Web
  test failures and generated/plugin lint noise. No Phase 7B changed file failed
  its applicable focused or integration gate.
- Anonymous `ls-remote` and recursive clone confirmed public/local equality.
  Only `main` was pushed; no force push was used.

## Final state

`PHASE_7B = PASS`  
`ONE_COMMAND_DEPLOYMENT = QUALIFIED`  
`PRODUCTION_AUTH_BROWSER_E2E = PASS`  
`PRODUCTION_JUDGE_AC_WA = PASS`  
`REBOOT_SURVIVAL = PASS`  
`DEPLOYMENT_IDEMPOTENCY = PASS`  
`PUBLIC_REMOTE_QUALIFICATION = PASS`

Linux ARM64 remains NOT QUALIFIED. Mac Judge remains NOT TARGET. Phase 5 Mac
remains DEFERRED.
