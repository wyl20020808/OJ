# OJPlatform Full Product State Diagnosis & Recovery V1

Status: PARTIAL

## Diagnosis

- Runtime Manager registry pointed at `D:\OJPlatform-worktrees\judgedata-artifact-pipeline-v1`, branch `codex/judgedata-artifact-pipeline-v1`, commit `a9074841ec3d35fd95ab6cfe6ecb70b0c09ac647`.
- Canonical product source was `D:\OJPlatform`, branch `main`, commit `df5ef4c6420e55d2be419e2a299e3fa28912af19` before integration; recovery merge and final documentation commits are on canonical `main`.
- No target application listeners were running before recovery. Root cause included `RUNTIME_SOURCE_MISMATCH` and stale shared runtime ownership.
- Historical merge comparison found lost evaluation row navigation, owner-only problem edit visibility, split sample presentation/copy behavior, desktop aside flow, Chinese Judge breadcrumb, anonymous evaluation-list protection, and permission-gated admin navigation.

## Implemented

- Restored evaluation row click and Enter/Space navigation while preserving nested submission/problem links.
- Restored backend capability-driven `ProblemDetail` edit visibility and split sample input/output panes with input-only copy.
- Restored document-flow problem aside and `Judge 节点管理` breadcrumb label.
- Restored authenticated-only evaluation list access.
- Restored permission-gated `管理` navigation through `/api/admin/judge/capabilities`.
- Existing configured operator IDs/usernames now participate in the existing `problem.edit` capability path in both infrastructure and in-memory app composition. No hardcoded username bypass was added.

## Tested

- Focused Web/Product/Auth suite: 15 test files, 383 tests passed.
- Web and API TypeScript checks passed.
- Web production build passed; only the existing large-chunk warning was emitted.
- `git diff --check` passed.

## Runtime Verified

- `scripts/dev-runtime.ps1 start -Verify` passed.
- Final Runtime Manager status reports product `D:\OJPlatform`, branch `main`, and the current `main` HEAD; plugin reports canonical `main` commit `b8fbfcc49643e2487e47ac0c5b55d966270d13cc`. Runtime source and HEAD matched at verification time.
- PostgreSQL, Redis, MinIO, API, Web, Judge Service, Host Agent, Supervisor, and REAL_SANDBOXED worker passed manager health checks.
- Final status reports `MIXED SOURCE = False`; application listeners are owned by `D:\OJPlatform`.

## Browser Smoke

- Local Web loaded from `http://127.0.0.1:5173`.
- Evaluation list loaded with result/problem/submitter filters, ordered rows, verdicts, and submission/problem links.
- Guest session showed `游客` and no `管理` navigation, matching backend capability gating.

## Not Verified

- Browser login as persisted `root` and root editing another user's problem.
- Browser admin node page with operator navigation.
- Browser source visibility for an owner and cross-owner operator.
- Manual visual confirmation of row body click navigation; equivalent interaction is covered by focused tests.

## Blocked / Risk

- Root password credential remains unknown; no credential reset or secret change was performed.
- Existing Supervisor Windows host syscall/root-cgroup fixture failures remain outside this recovery change. Runtime manager doctor and live Supervisor health passed on the current WSL environment.

## Integration

- Recovery branch: `codex/full-product-state-recovery-v1`.
- Normal merge into canonical `main` is required after review; no squash or history rewrite is intended.
