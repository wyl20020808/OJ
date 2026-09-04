# OJPlatform Post-C2 Browser Remediation Acceptance V1

## Status

PARTIAL. Product fixes are implemented and focused automated checks pass. Runtime was started from this worktree with migration `0019_editor_code_drafts`. Chrome browser observation confirmed the original Run Code failure and confirmed the repaired adapter reaches `POST /api/code-runs`; the available seeded qualification problem had no published Judge Data, so final `SUCCEEDED`/stdout `3` and formal-submit navigation could not be runtime-qualified on that problem.

## Root Causes and Fixes

- Run Code root cause: plugin HTTP adapters used an unbound default `window.fetch`, producing `TypeError: Illegal invocation` before any request. Defaults now bind `globalThis.fetch`; adapter diagnostics retain categorized console errors.
- Profile root cause: avatar was centered inside a left identity column. Desktop identity now uses a three-column grid with avatar in the center column and actions in the right column; mobile collapses to a centered identity block.
- Submit root cause: submission success only rendered a secondary “view evaluation” button. Plugin now calls the host navigation callback immediately after receiving the submission identity. Route remains Host-owned.

## Evidence

- Chrome (`channel: chrome`) loaded `http://127.0.0.1:5173`.
- Before fix: `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`; no code-run request.
- After fix: `POST /api/code-runs` observed with status `202`, followed by authenticated polling. One malformed inline source intentionally produced `COMPILE_ERROR`; valid-source run was blocked by the seeded problem/runtime state before terminal verdict evidence could be captured.
- Profile layout measurement: avatar center delta `0.016px` from identity region center; edit button right-aligned.
- Migration `0019_editor_code_drafts`: applied/reused by Runtime Manager.

## Automated Validation

- Plugin tests: 17 files, 31 passed.
- OJPlatform focused Web/Profile tests: 2 files, 168 passed.
- Web typecheck: PASS (`tsc -p apps/web/tsconfig.json --noEmit`).
- Web build: PASS.
- API build: PASS.
- Plugin typecheck/build: PASS.
- `git diff --check`: PASS.

## Not Verified / Blocked

- Final valid Code Run `SUCCEEDED` with stdout `3`: NOT VERIFIED. Seeded problem `phase2c1-success-1788098037058` returned `JUDGE_DATA_UNAVAILABLE` for formal submission and did not expose published judge data for a terminal ad-hoc verdict during smoke.
- Formal Submit immediate Evaluation Detail navigation: NOT VERIFIED at runtime for same blocker, but covered by plugin test and implemented through existing Host callback.
- Autosave browser reload/isolation smoke: NOT VERIFIED in this run; C2 implementation remains present and automated coverage passes.

## Git

OJPlatform start base: `dd90672`.
Plugin start base: `ee8b6ca`.
