# OJPlatform Dual Repository Consolidation V1

Date: 2026-09-04

## Result

`DUAL REPOSITORY CONSOLIDATION = PASS`

This was a Git-governance audit. No product behavior, judge semantics, editor
behavior, runtime design, or plugin UX was changed. The only OJPlatform content
merged after the final-feature candidate was existing WSL runtime-qualification
evidence, committed as `8fa8f62` and merged normally into `main`.

## OJPlatform

```text
REPO = D:\OJPlatform
ORIGINAL HEAD = 60e4fa2
ORIGINAL BRANCH = codex/unified-judge-runtime-integration-v1
CANDIDATE BEFORE CONSOLIDATION = codex/final-feature-integration-v1 @ b83c33c
CANONICAL MAIN = main
CANONICAL MAIN FUNCTIONAL BASELINE = d5d6991
MAIN CREATED / UPDATED = YES
LOCAL BRANCH COUNT = 80
WORKTREE COUNT = 23
STASH COUNT = 0
TRACKED DIRTY WORKTREES = 0
REQUIRED UNIQUE COMMITS FOUND = 0
REQUIRED UNIQUE COMMITS INTEGRATED = 0
REQUIRED UNMERGED COMMITS = 0
UNKNOWN BRANCHES = 0
```

All 78 pre-existing local branches were inspected against the candidate with
`merge-base`, `log`, and `cherry`. Seventy-two are ancestors. Six are
superseded and were intentionally not merged: `phase1b-problem-authoring`,
`phase1c-submission-web`, `phase2c8b-product-backend-judge-admin-adapter-rbac`,
`product-account-identity-v1`, `product-identity-verification-social-v2`, and
`runtime-port-reconciliation-v1`. Later candidate history contains their
replacement implementations: problem authoring V2/public metadata, current
web/plugin integration, Phase 3 judge-data integration, current auth flows,
and `cf701f8` plus final cross-worktree runtime control respectively.

`git fsck --no-reflogs --unreachable` found 53 historical unreachable commits.
They are not branches, stashes, or worktrees. Commit subjects correspond to
superseded or already-integrated historical work; they were left untouched.

The root worktree has 28 untracked artifacts. They are preserved as user or
unknown artifacts, including goal-read directories, temporary inspection
directories, `Goals/`, fixtures, and the runtime qualification report before it
was explicitly committed. No untracked artifact was deleted. The former tracked
change to `Docs/PROJECT_STATUS.md` was validated with its accompanying runtime
qualification report, committed, and merged into `main`.

## OnlineCodeEditor

```text
REPO = D:\OJPlatformPlugins\OnlineCodeEditor
ORIGINAL HEAD = ee8b6ca
ORIGINAL BRANCH = codex/editor-draft-autosave-v1
CANDIDATE BEFORE CONSOLIDATION = codex/post-c2-remediation-v1 @ 560a5ae
CANONICAL MAIN = main
CANONICAL MAIN FUNCTIONAL BASELINE = 560a5ae
MAIN CREATED / UPDATED = YES
LOCAL BRANCH COUNT = 11
WORKTREE COUNT = 2
STASH COUNT = 0
TRACKED DIRTY WORKTREES = 0
REQUIRED UNIQUE COMMITS FOUND = 0
REQUIRED UNIQUE COMMITS INTEGRATED = 0
REQUIRED UNMERGED COMMITS = 0
UNKNOWN BRANCHES = 0
```

All ten pre-existing plugin branches are ancestors of `560a5ae`; no merge or
cherry-pick was required. Three historical unreachable commits were found and
left untouched because their equivalent work is reachable through the canonical
plugin history. `pnpm-lock.yaml` is untracked in both plugin worktrees. The
repository tracks `package-lock.json`, has no pnpm package-manager policy, and
does not ignore `pnpm-lock.yaml`; it is classified as `USER_ARTIFACT`, not
committed or deleted.

## Feature Coverage

| Area | Result | Evidence |
| --- | --- | --- |
| Public problem/evaluation IDs, tags, source, creator | PRESENT | `tests/public-metadata.test.ts`, problem and submission modules |
| JudgeData 100 MiB, bounded stream, ZIP/path/hash gates | PRESENT | `26e69e9`, judge-data modules and tests |
| Editor host, height, aligned I/O, sample copy, exact code tab | PRESENT | web contribution plus plugin editor sources |
| Draft migration, GET/PUT, conflicts, isolation, 10s debounce | PRESENT | migration `0019_editor_code_drafts`, editor-draft module, `HostedEditor.tsx` |
| Ad-hoc Run Code and bound browser fetch | PRESENT | code-run routes and `HttpCodeRunAdapter` |
| Profile cleanup | PRESENT | `7084d53`, profile/web sources |
| Submit navigation and evaluation detail tabs/IDs | PRESENT | submission-detail tests and plugin `RunPanel.tsx` |
| Authenticated SSE, replay, reconnect, duplicate safety, cleanup | PRESENT | submission events/routes and `tests/evaluation-live-sse.test.ts` |
| Judge incremental events, filtering, durable projection, Redis fanout | PRESENT | judge runtime events, API projection, Redis Pub/Sub |
| Runtime ports, shared registry, cross-worktree controls, authoritative status | PRESENT | `cf701f8`, `c529fc5`, `b83c33c`, `scripts/dev-runtime.ps1` |
| Plugin CodeMirror, autosave states/late-load/stale-save/flush, run, submit | PRESENT | plugin `src/` and 31 passing tests |

`MISSING REQUIRED FEATURES = NONE`. No feature was restored by copying files;
all retained implementation is reachable through normal Git history.

## Validation

```text
OJ ARCHITECTURE / DIFF CHECK = PASS
OJ FOCUSED TESTS = PASS (5 files, 32 tests)
OJ RUNTIME FOCUSED TESTS = PASS (1 file, 24 tests)
OJ WEB TYPECHECK = PASS (root TypeScript check)
OJ WEB BUILD = PASS
OJ API TYPECHECK = PASS (root TypeScript check)
OJ API BUILD = PASS
PLUGIN TESTS = PASS (17 files, 31 tests)
PLUGIN TYPECHECK = PASS
PLUGIN BUILD = PASS
```

Existing WSL Docker/runtime evidence remains separately recorded in
`OJPLATFORM_WSL_DOCKER_RUNTIME_FINAL_QUALIFICATION_REPORT.md`. Full browser
E2E, judge verdict requalification, long soak, and
`REAL_EXECUTION_SET_INFRA_FAILURE` investigation were intentionally outside
this consolidation goal.

## Final Governance

```text
ALL REQUIRED RESULTS IN MAIN = YES
UNMERGED REQUIRED COMMITS = 0
UNCOMMITTED TRACKED PROJECT CHANGES = 0
DIRTY REGISTERED WORKTREES = 0
UNKNOWN BRANCHES = 0
STASHES REQUIRING ACTION = 0
USER ARTIFACTS DELETED = NO
FAILED / SUPERSEDED BRANCHES MERGED = NO
REMOTE HISTORY REWRITTEN = NO
OJPLATFORM CANONICAL BASELINE = d5d6991
ONLINE CODE EDITOR CANONICAL BASELINE = 560a5ae
PROJECT CONSOLIDATION = PASS
REMAINING ACTIONS = NONE
```
