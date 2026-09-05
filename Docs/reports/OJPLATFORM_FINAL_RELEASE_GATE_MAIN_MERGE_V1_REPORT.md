# OJPlatform Final Release Gate & Main Merge V1

Status: PARTIAL. Main merge intentionally not performed.

## Candidate

- Candidate branch: `codex/conservative-product-ux-final-integration-v1`
- Candidate HEAD: `a80fe329cf05fa5143eb8f5242c18033f1c0959b`
- Main HEAD at start: `7b812a861e827a16bc0e4ff923747e18145d729a`
- Main drift: YES.

## Validation

- Critical focused Web/product tests: PASS, `255/255`
- Web typecheck (`tsc -p tsconfig.json --noEmit`): PASS
- Web build: PASS
- `git diff --check`: PASS
- Product targeted baseline reported by candidate: `216/216` PASS
- Plugin tests/typecheck/build reported by candidate: PASS

## Runtime

Formal Runtime Manager start with `-SourceRoot` was attempted after restoring a registered temporary main worktree required by the manager. Infrastructure recovered: PostgreSQL, Redis, and MinIO reachable. Runtime did not reach a healthy product flow: API/Judge processes remained owned by `D:\OJPlatform`, Web and Host Agent were down, Worker was stale, and status reported `MIXED SOURCE = True`. The start/verify gate therefore failed source matching and service health requirements.

## Browser and real flow

Problem List, Problem Detail, Online Editor visibility, Editor Run, Submit, Authoring, Evaluation Detail, and global baseline browser checks: NOT VERIFIED because runtime did not reach a single-source healthy state. No real Run or Submit claim is made.

## Merge decision

`MERGE ALLOWED = NO`. Required runtime source match, `MIXED SOURCE = False`, healthy API/Web/Judge/Host/Supervisor/Worker, and browser smoke evidence were not achieved. No normal merge was executed. Existing user changes and untracked artifacts were preserved; `scripts/dev-runtime.ps1` was not modified.

## Follow-up

Reconcile shared Runtime Manager ownership and stale application processes, then rerun this gate from the candidate source. Do not merge until single-source runtime and minimum browser/Run evidence pass.
