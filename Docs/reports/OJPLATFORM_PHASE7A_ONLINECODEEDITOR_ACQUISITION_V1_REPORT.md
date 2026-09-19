# Phase 7A OnlineCodeEditor Authoritative Remote + Submodule Acquisition Report

Date: 2026-09-19
Status: **PASS** — the last Phase 7A blocker is resolved.

## Live OJPlatform Main

- `D:\OJPlatform` on `main`,
  `HEAD` = `refs/heads/main` = `4bf0935ea5375b2a8eacd28b577934fea347efb1`,
  tracked clean, stashes preserved. **Not modified and not merged.**

## Phase 7A Feature State

- Worktree `D:\OJPlatform-worktrees\phase7a-standard-deployment-v1`,
  branch `codex/phase7a-standard-deployment-v1`, clean.
- All earlier Phase 7A deployment and E2E acceptance still holds: two-command
  deploy, 15 security gates, `EXECUTION_READY`, real `AC/WA/CE/RE/TLE`, editor
  DOM smoke, idempotent re-runs, and reboot recovery.

## OnlineCodeEditor Local Repository

- `D:\OJPlatformPlugins\OnlineCodeEditor`, branch `main`,
  HEAD `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`, 29 commits, 77 tracked files,
  880 KB of history.
- Independent project: own `package.json`, tracked `package-lock.json`, own
  Vite/TypeScript/vitest scripts, own `plugin.manifest.json`
  (`ojplatform.online-code-editor`, slot `problem.solve.editor`).
- No tracked modifications. Only untracked leftovers were present before the
  push (`nul`, `pnpm-lock.yaml`); neither was modified or committed.
- Untracked branches (17 historical `codex/*`) were deliberately **not**
  published. No stashes.

## Existing Remote Audit

- Before this task the plugin had **no remote at all**: `git remote -v` empty
  and no `remote.*` configuration.
- The GitHub account's public repositories were enumerated read-only: `OJ`
  (empty), `word-memo-server`, `test`, `Wyl_OnlineJudge`, `games`, `justoj`.
  None is an editor/plugin repository, and the two older Online Judge projects
  were not bound to this plugin.
- The user first supplied `https://github.com/wyl20020808/OJ` (public, empty)
  and then clarified that **`OJ` is reserved for the OJPlatform main
  repository**. No plugin history was pushed there.
- The user then created the dedicated plugin repository
  `https://github.com/wyl20020808/OnlineEditor`, verified as **public**,
  **empty** (`size = 0`, zero refs, default branch `main`, not a fork).

## GitHub Authentication

- `gh` CLI is not installed, so repository creation and authenticated search
  were not available. Publication used the machine's existing Git credential
  manager (`credential.helper = manager`) over HTTPS.
- No token, credential-store content, or secret was read, printed, or embedded
  in any remote URL.

## Authoritative Remote

```text
ONLINE_CODE_EDITOR_REMOTE = https://github.com/wyl20020808/OnlineEditor.git
ONLINE_CODE_EDITOR_REMOTE_VISIBILITY = PUBLIC
```

## Repository Visibility

PUBLIC, verified from the GitHub API and by an unauthenticated `git ls-remote`.
A public repository means `git clone --recurse-submodules` needs no extra
credentials for a fresh user.

## Plugin Secret Audit

**PASS** (run before publication and applicable to the published history).

- No `.env`, `.pem`, `.key`, `id_rsa`, `secret`, `credential`, `.p12`, `.pfx`
  or `token` filenames in the added-file history.
- No `BEGIN ... PRIVATE KEY`, `AKIA…`, `ghp_…`, `xox…` or `-----BEGIN` matches
  in any reachable commit.
- No blob above 1 MB; total history 880 KB. `node_modules/` and `dist/` are
  untracked and ignored, so no build output was published.

## Plugin Remote Publication

- `git remote add origin https://github.com/wyl20020808/OnlineEditor.git`
  (HTTPS, no embedded credentials).
- `git push -u origin main` — succeeded. **Only `main` was pushed**; the 17
  historical branches were not. No force push and no history rewrite.

## Plugin Remote Verification

- `git ls-remote origin` → `refs/heads/main` = `09877bf30a344bfd8d61775d1ee64c8ae61c9f86`
- `origin/main` = local `main` = `09877bf…` → **match**
- Remote head count: 1 branch.
- Fresh temporary clone of the remote succeeded: HEAD `09877bf…`, 77 files,
  `plugin.manifest.json`, `package.json` and `src/` all present.

## Submodule Decision

**Submodule** — confirmed as the correct acquisition method and now implemented.

Suitability was verified before adopting it: independent repository and history,
own tracked lockfile, own build/test toolchain, self-contained 77-file tree, and
880 KB of history. All Phase 7A regressions stay fixed:

| Regression | State after submodule adoption |
| --- | --- |
| Plugin pulled into the main pnpm workspace | `pnpm-workspace.yaml` still lists only `apps/*` and `packages/*`; `pnpm install --frozen-lockfile` passes over 14 workspace projects and the plugin is not one. |
| Main lockfile broken by plugin dependencies | Verified: frozen-lockfile install unchanged; plugin deps install inside the Web image from the plugin's own `package-lock.json`. |
| Plugin source entering the main Docker build context | `.dockerignore` still excludes `plugins`. |
| Machine-specific plugin path | None: the Compose default is repository-relative. |
| Plugin path blocking Judge-only renders | Unchanged: Core-only and Judge renders both pass with no plugin variable set. |

The only repository-side change required was the ignore exception
`!plugins/OnlineCodeEditor`, because `.gitignore` intentionally keeps stray
`plugins/*` checkouts out of the repository.

## .gitmodules

```ini
[submodule "plugins/OnlineCodeEditor"]
	path = plugins/OnlineCodeEditor
	url = https://github.com/wyl20020808/OnlineEditor.git
```

No `branch =` entry: the gitlink commit is the source of truth and the build
never follows the plugin's `main`.

## Pinned Plugin Commit

`09877bf30a344bfd8d61775d1ee64c8ae61c9f86` — recorded as a mode `160000`
gitlink at `plugins/OnlineCodeEditor`, verified equal to the submodule working
tree HEAD in every clone test.

## pnpm Workspace Isolation

**PASS.** `pnpm install --frozen-lockfile` succeeds; `pnpm -r list` shows no
plugin project; the plugin is not a workspace package.

## Docker Build Context Isolation

**PASS.** `.dockerignore` still excludes `plugins`, so the main build context
never carries the plugin. `Dockerfile.web` consumes it only through the
`online-code-editor` named build context.

## OnlineCodeEditor Context Contract

Unchanged and now repository-relative by default:

```yaml
additional_contexts:
  online-code-editor: ${OJPLATFORM_ONLINE_CODE_EDITOR_CONTEXT:-./plugins/OnlineCodeEditor}
```

The variable is documented as an optional developer override for a custom
checkout. A normal fresh deployment never sets it
(`OJPLATFORM_PLUGIN_CONTEXT_ENV_REQUIRED_FOR_NORMAL_DEPLOY = NO`), and no
machine-specific path appears anywhere.

## Judge-Only Coupling

`JUDGE_ONLY_WEB_PLUGIN_COUPLING = RESOLVED`, re-verified after adoption: both
the Core-only render and the Judge-profile render pass with synthetic
deployment values and **no** plugin path configured, and both resolve the Web
plugin context to the repository-local submodule.

## Fresh Clone / Submodule Acquisition

Both acquisition paths were exercised on real, independent checkouts.

Path A — initial clone, on a fresh disposable VM with no plugin present:

```sh
git clone --recurse-submodules -b codex/phase7a-standard-deployment-v1 <bundle> OJPlatform
```

Result: repository at `f4110a8`, `plugins/OnlineCodeEditor` populated **from
GitHub** (77 files, `origin` = the public remote), submodule HEAD `09877bf…`
equal to the gitlink.

Path B — existing clone, in a separate fresh checkout where the plugin was
absent by construction:

```sh
git clone -b codex/phase7a-standard-deployment-v1 <bundle> OJPlatform
# plugins/OnlineCodeEditor absent
git submodule update --init --recursive
```

Result: registered and cloned from
`https://github.com/wyl20020808/OnlineEditor.git`, `checked out '09877bf…'`.

Neither path copied, seeded, or rsynced a local plugin checkout.

## Docker Web Build

**PASS.** The Web image was built from the submodule-acquired checkout with no
machine-specific plugin variable:

- Local WSL build from `fresh-clone-nr`: exit 0, image produced.
- On the fresh VM from the `--recurse-submodules` clone:
  `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build web`
  completed in 5m20s and the container then ran the newly built image
  `fa2941cc9bb5…` after a forced recreate.

The image build also proves the frozen-lockfile path (main workspace install
inside the image) is unaffected by the plugin.

Runtime image hygiene verified: CodeMirror is present in the served bundle, and
there is **no `.git` directory, no plugin source tree, and no
`plugin.manifest.json`** in the runtime image.

## Editor Browser Smoke

**PASS (DOM level)** against the image built from the submodule-acquired
source, driving real Chrome:

- `.cm-editor` = true, `.cm-content` = true, `.cm-gutters` = true, `cm-line`
  count ≥ 1, contenteditable = true
- keyboard input accepted: `#include <iostream> int main(){return 0;}`
- page errors: none
- screenshot: `editor-dom-smoke-submodule.png`

## Plugin Independent Build/Test

**PASS**, run inside the plugin repository itself:

- `npm run typecheck` — clean
- `npm test` — 20 files, 56 tests passed
- `npm run build` — succeeded (only a Vite chunk-size advisory)

The plugin remains independently cloneable, buildable and testable; the
submodule is only a version reference.

## OJPlatform Validation

- `pnpm install --frozen-lockfile` — pass
- `pnpm typecheck` and `pnpm build` — pass
- `pnpm test:architecture` — pass
- ESLint on the changed test file — clean; Prettier — clean on all changed files
- `tests/deployment-contract.test.ts` — 24 tests pass, now including the
  submodule pin contract, the gitlink mode check, the no-machine-path check and
  the ignore-exception check
- Core-only and Judge-profile Compose renders — pass, plugin context resolves to
  the repository-local submodule
- `git diff --check` — clean

## Two-Command Deployment Preservation

Unchanged:

1. `docker compose -f compose.yaml -f compose.prod.yaml --profile judge up -d --build`
2. `sudo ./deploy/judge-host/install.sh`

`MAIN_DEPLOY_COMMAND_COUNT = 2`. Submodule acquisition is part of `git clone`,
not a third orchestration command. No custom orchestrator, Docker wrapper, or
status CLI was added. `deploy/judge-host/install.sh` and the systemd units are
untouched by this task.

## Handoff Update

Handoff updated on the Phase 7A branch: Phase 7A is feature complete, the
plugin acquisition blocker is closed, `OJ` is recorded as the reserved
OJPlatform main-repository remote (still unpublished), and the next step is
integration from latest live `main`.

## PROJECT_STATUS Record

Appended, append-only. The earlier Phase 7A PARTIAL record and the intermediate
BLOCKED record are both preserved unmodified; a new PASS record was added.

## Feature Commits

- `f4110a8` `chore: pin OnlineCodeEditor as a submodule`
- Docs/status commit recorded after validation (this report, handoff,
  PROJECT_STATUS, README, deployment guide, `plugins/README.md`,
  `.env.production.example`)

The 13 earlier Phase 7A commits are not squashed. Nothing was merged to `main`.

## Remaining Gaps

1. `OJPLATFORM_REMOTE_PUBLICATION = PENDING`: `https://github.com/wyl20020808/OJ`
   is reserved for the OJPlatform main repository but was deliberately not
   published by this task. The submodule URL is absolute, so acquisition does
   not depend on it.
2. `install.sh` still requires a Go/Node/pnpm toolchain on the host; documented
   as a prerequisite with a fail-closed message.
3. Linux ARM64 and macOS remain out of scope (`NOT QUALIFIED` / `NOT TARGET`).

## Next Action

`INTEGRATE_PHASE_7A_FROM_LATEST_MAIN` — an Integration Lead reviews and
integrates the Phase 7A feature history from the latest live `main`. Do not
merge from this task, and do not start Phase 7B, ARM64 or Mac work without an
explicit decision.
